require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse');
const morgan = require('morgan');
const { init, runAsync, allAsync, getAsync } = require('./db');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

let WebSocketTransport = null;
try {
  WebSocketTransport = require('ws');
} catch (err) {
  WebSocketTransport = null;
}

// Start retry scheduler after db/env setup. It is intentionally non-fatal.
try { require('./scheduler'); } catch (e) { console.warn('scheduler not loaded', e.message); }

const PLIVO_AUTH_ID = process.env.PLIVO_AUTH_ID;
const PLIVO_AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN;
const PLIVO_SOURCE_NUMBER = process.env.PLIVO_SOURCE_NUMBER;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_VOICE_BUCKET = process.env.SUPABASE_VOICE_BUCKET || 'voice-files';

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  if (WebSocketTransport) {
    options.realtime = { transport: WebSocketTransport };
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options);
}

let plivoClient = null;
if (PLIVO_AUTH_ID && PLIVO_AUTH_TOKEN) {
  const plivo = require('plivo');
  plivoClient = new plivo.Client(PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN);
}

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));

const PORT = process.env.PORT || 3001;
const TMP_DIR = path.join(__dirname, 'tmp');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });

app.use('/uploads', (req, res, next) => {
  if (req.path.endsWith('.mp3') || req.path.endsWith('.wav')) {
    res.set('Accept-Ranges', 'none');
    res.set('Cache-Control', 'no-cache, public');
  }
  next();
});
app.use('/uploads', express.static(UPLOADS_DIR));

// The user asked for Asia/Chennai. The valid IANA timezone for Indian Standard Time is Asia/Kolkata.
const INDIA_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Kolkata';

function nowIso() {
  return new Date().toISOString();
}

function parseStoredDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return new Date(Number(text));

  // Older rows may contain an IST display string. Treat that as IST and convert to a Date.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    const [datePart, timePart] = text.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    const offsetMs = (5 * 60 + 30) * 60 * 1000;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);
  }

  const normalized = text.endsWith('Z') || text.includes('T') ? text : `${text}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatToIndiaTime(value) {
  const date = parseStoredDate(value);
  if (!date) return '';

  try {
    const opts = {
      timeZone: INDIA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(date);
    const map = {};
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} IST`;
  } catch (err) {
    return String(value);
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function normalizePhoneNumber(value) {
  return String(value || '').trim();
}

const TERMINAL_RECIPIENT_STATUSES = new Set(['completed', 'failed', 'failed_permanent', 'cancelled']);

function isTerminalRecipient(status) {
  return TERMINAL_RECIPIENT_STATUSES.has(String(status || '').toLowerCase());
}

function campaignDisplayStatus(campaign, stats) {
  const status = String(campaign.status || '').toLowerCase();
  if (status) return status;
  if (!stats || stats.total === 0) return 'draft';
  if (stats.total > 0 && stats.terminal === stats.total) return 'completed';
  if (stats.running > 0 || stats.waiting > 0) return 'running';
  return 'draft';
}

function buildRecipientStats(recipients) {
  const stats = {
    total: recipients.length,
    waiting: 0,
    pending: 0,
    retry: 0,
    running: 0,
    completed: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    terminal: 0,
  };

  for (const row of recipients) {
    const status = String(row.status || 'pending').toLowerCase();
    if (status === 'pending') stats.pending += 1;
    if (status === 'retry') stats.retry += 1;
    if (status === 'pending' || status === 'retry') stats.waiting += 1;
    if (status === 'sent' || status === 'calling' || status === 'in_progress') stats.running += 1;
    if (status === 'sent') stats.sent += 1;
    if (status === 'completed') stats.completed += 1;
    if (status === 'failed' || status === 'failed_permanent') stats.failed += 1;
    if (status === 'cancelled') stats.cancelled += 1;
    if (isTerminalRecipient(status)) stats.terminal += 1;
  }

  return stats;
}

function normalizeCampaign(campaign, stats) {
  if (!campaign) return null;
  return {
    ...campaign,
    status: campaignDisplayStatus(campaign, stats),
    created_at_ist: formatToIndiaTime(campaign.created_at),
    started_at_ist: formatToIndiaTime(campaign.started_at),
    stopped_at_ist: formatToIndiaTime(campaign.stopped_at),
    completed_at_ist: formatToIndiaTime(campaign.completed_at),
    timezone: INDIA_TIME_ZONE,
  };
}

function normalizeRecipient(recipient) {
  return {
    ...recipient,
    last_attempt_at_ist: formatToIndiaTime(recipient.last_attempt_at),
    next_attempt_at_ist: formatToIndiaTime(recipient.next_attempt_at),
  };
}

async function getCampaignWithRecipients(campaignId) {
  const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
  if (!campaign) return null;
  const recipients = await allAsync(`SELECT * FROM recipients WHERE campaign_id = ? ORDER BY id ASC`, [campaignId]);
  const stats = buildRecipientStats(recipients);
  return { campaign, recipients, stats };
}

async function refreshCampaignCompletion(campaignId) {
  const bundle = await getCampaignWithRecipients(campaignId);
  if (!bundle) return null;

  const { campaign, recipients, stats } = bundle;
  const currentStatus = String(campaign.status || '').toLowerCase();

  if (currentStatus === 'stopped') {
    return { campaign, recipients, stats };
  }

  if (stats.total > 0 && stats.terminal === stats.total) {
    const completedAt = campaign.completed_at || nowIso();
    await runAsync(
      `UPDATE campaigns SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
      ['completed', completedAt, campaignId]
    );
    return getCampaignWithRecipients(campaignId);
  }

  if ((stats.running > 0 || stats.waiting > 0) && currentStatus !== 'running') {
    await runAsync(
      `UPDATE campaigns SET status = ? WHERE id = ?`,
      ['running', campaignId]
    );
    return getCampaignWithRecipients(campaignId);
  }

  return { campaign, recipients, stats };
}

function basicAuth(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const encoded = auth.split(' ')[1];
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return res.status(401).send('Unauthorized');

    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
    return res.status(401).send('Unauthorized');
  } catch (err) {
    return res.status(401).send('Unauthorized');
  }
}

app.get('/', (req, res) => res.send('Voice call backend running'));

app.get('/api/auth/check', basicAuth, (req, res) => {
  res.json({ ok: true, message: 'Authenticated', timezone: INDIA_TIME_ZONE });
});

app.get('/api/check-audio', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing url query param' });

  try {
    const client = url.startsWith('https://') ? https : http;
    const request = client.request(new URL(url), (resp) => {
      res.json({ url, statusCode: resp.statusCode, headers: resp.headers });
      try { resp.destroy(); } catch (err) { /* ignore */ }
    });
    request.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    request.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/uploads', basicAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase Storage is not configured.' });
    }

    const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${sanitized}`;
    const fileBuffer = fs.readFileSync(req.file.path);

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_VOICE_BUCKET)
      .upload(filename, fileBuffer, {
        contentType: req.file.mimetype || 'audio/mpeg',
        upsert: false,
      });

    try { fs.unlinkSync(req.file.path); } catch (cleanupError) { console.warn('Temporary upload cleanup failed:', cleanupError.message); }

    if (uploadError) {
      console.error('/api/uploads Supabase upload error', uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { data } = supabase.storage.from(SUPABASE_VOICE_BUCKET).getPublicUrl(filename);
    res.json({ url: data.publicUrl, path: filename, bucket: SUPABASE_VOICE_BUCKET });
  } catch (err) {
    console.error('/api/uploads error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns', basicAuth, async (req, res) => {
  const { name, type, message_text, voice_url, retry_delay_minutes, max_attempts } = req.body;

  if (!name || !type) return res.status(400).json({ error: 'Campaign name and type are required.' });
  if (!['voice', 'sms'].includes(String(type).toLowerCase())) return res.status(400).json({ error: 'Campaign type must be voice or sms.' });

  try {
    const result = await runAsync(
      `INSERT INTO campaigns (name, type, message_text, voice_url, retry_delay_minutes, max_attempts, created_at, status)
       VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
      [name, type, message_text || '', voice_url || '', Number(retry_delay_minutes || 5), Number(max_attempts || 3), nowIso(), 'draft']
    );

    res.json({ id: result.lastID });
  } catch (err) {
    console.error('POST /api/campaigns error', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns', basicAuth, async (req, res) => {
  try {
    const campaigns = await allAsync(`SELECT * FROM campaigns ORDER BY created_at DESC, id DESC`, []);
    const result = [];

    for (const campaign of campaigns) {
      const recipients = await allAsync(`SELECT status FROM recipients WHERE campaign_id = ?`, [campaign.id]);
      const stats = buildRecipientStats(recipients);
      const refreshed = await refreshCampaignCompletion(campaign.id);
      const latestCampaign = refreshed ? refreshed.campaign : campaign;
      const latestStats = refreshed ? refreshed.stats : stats;
      result.push({ campaign: normalizeCampaign(latestCampaign, latestStats), stats: latestStats });
    }

    const summary = result.reduce((acc, item) => {
      const status = String(item.campaign.status || '').toLowerCase();
      acc.total += 1;
      if (status === 'running') acc.running += 1;
      else if (status === 'completed') acc.completed += 1;
      else if (status === 'stopped') acc.stopped += 1;
      else acc.active += 1;
      acc.waitingCalls += item.stats.waiting;
      acc.runningCalls += item.stats.running;
      acc.completedCalls += item.stats.completed;
      return acc;
    }, { total: 0, active: 0, running: 0, completed: 0, stopped: 0, waitingCalls: 0, runningCalls: 0, completedCalls: 0 });

    res.json({ campaigns: result, summary, timezone: INDIA_TIME_ZONE });
  } catch (err) {
    console.error('GET /api/campaigns error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/recipients/upload', basicAuth, upload.single('file'), async (req, res) => {
  const campaignId = req.params.id;

  try {
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });

    if (String(campaign.status || '').toLowerCase() === 'stopped') {
      return res.status(400).json({ error: 'Cannot upload recipients to a stopped campaign.' });
    }

    const numbers = [];

    if (req.file) {
      const content = fs.readFileSync(req.file.path, 'utf8');
      await new Promise((resolve, reject) => {
        csvParse(content, { trim: true, skip_empty_lines: true }, (err, records) => {
          if (err) return reject(err);
          for (const row of records) {
            const num = normalizePhoneNumber(row[0]);
            if (num && !/^phone/i.test(num)) numbers.push(num);
          }
          resolve();
        });
      });
      try { fs.unlinkSync(req.file.path); } catch (err) { /* ignore */ }
    } else if (Array.isArray(req.body.numbers)) {
      for (const num of req.body.numbers) {
        const normalized = normalizePhoneNumber(num);
        if (normalized) numbers.push(normalized);
      }
    } else {
      return res.status(400).json({ error: 'No file or numbers provided' });
    }

    const inserted = [];
    for (const number of numbers) {
      const result = await runAsync(
        `INSERT INTO recipients (campaign_id, phone_number, status) VALUES (?,?,?) RETURNING id`,
        [campaignId, number, 'pending']
      );
      inserted.push({ id: result.lastID, phone_number: number });
    }

    if (inserted.length > 0 && (!campaign.status || String(campaign.status).toLowerCase() === 'draft')) {
      await runAsync(`UPDATE campaigns SET status = ? WHERE id = ?`, ['active', campaignId]);
    }

    res.json({ inserted: inserted.length, recipients: inserted });
  } catch (err) {
    console.error('/api/campaigns/:id/recipients/upload error', err);
    res.status(500).json({ error: err.message });
  }
});

async function scheduleRetryOrFail(recipient, campaign, detail) {
  const maxAttempts = Number(campaign.max_attempts || 3);
  const retryDelayMinutes = Number(campaign.retry_delay_minutes || 5);

  await runAsync(
    `UPDATE recipients SET attempts = attempts + 1, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
    [nowIso(), detail, recipient.id]
  );

  const updated = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [recipient.id]);
  const attempts = Number(updated.attempts || 0);

  if (attempts >= maxAttempts) {
    await runAsync(
      `UPDATE recipients SET status = ?, next_attempt_at = NULL WHERE id = ?`,
      ['failed_permanent', recipient.id]
    );
  } else {
    const nextAttemptAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString();
    await runAsync(
      `UPDATE recipients SET status = ?, next_attempt_at = ? WHERE id = ?`,
      ['retry', nextAttemptAt, recipient.id]
    );
  }

  await refreshCampaignCompletion(recipient.campaign_id);
}

async function sendVoiceCall(recipient, campaign) {
  const campaignStatus = String(campaign.status || '').toLowerCase();
  if (campaignStatus === 'stopped' || campaignStatus === 'completed') {
    return { skipped: true, reason: `campaign is ${campaignStatus}` };
  }

  if (!plivoClient) {
    await runAsync(
      `UPDATE recipients SET status = ?, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
      ['completed', nowIso(), 'Simulated voice completion because Plivo credentials are not configured.', recipient.id]
    );
    await refreshCampaignCompletion(recipient.campaign_id);
    return { simulated: true };
  }

  const baseUrl = (process.env.BASE_URL || 'http://example.com').replace(/\/$/, '');
  const answerUrl = `${baseUrl}/api/plivo/answer?recipient_id=${recipient.id}`;

  try {
    const options = {
      answer_method: 'GET',
      hangup_url: `${baseUrl}/api/plivo/webhook`,
      hangup_method: 'POST',
    };

    const response = await plivoClient.calls.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      answerUrl,
      options
    );

    const uuid = response && (response.request_uuid || response.requestUuid || response.message_uuid || response.call_uuid) ?
      (response.request_uuid || response.requestUuid || response.message_uuid || response.call_uuid) : null;

    if (uuid) {
      await runAsync(
        `UPDATE recipients SET plivo_call_uuid = ?, status = ?, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
        [uuid, 'sent', nowIso(), JSON.stringify(response), recipient.id]
      );
    } else {
      await runAsync(
        `UPDATE recipients SET status = ?, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
        ['sent', nowIso(), JSON.stringify(response), recipient.id]
      );
    }

    await refreshCampaignCompletion(recipient.campaign_id);
    return response;
  } catch (err) {
    console.error('sendVoiceCall error', err.message, recipient);
    await scheduleRetryOrFail(recipient, campaign, err.message);
    return { error: err.message };
  }
}

async function sendSms(recipient, campaign) {
  const campaignStatus = String(campaign.status || '').toLowerCase();
  if (campaignStatus === 'stopped' || campaignStatus === 'completed') {
    return { skipped: true, reason: `campaign is ${campaignStatus}` };
  }

  if (!plivoClient) {
    await runAsync(
      `UPDATE recipients SET status = ?, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
      ['completed', nowIso(), 'Simulated SMS completion because Plivo credentials are not configured.', recipient.id]
    );
    await refreshCampaignCompletion(recipient.campaign_id);
    return { simulated: true };
  }

  try {
    const response = await plivoClient.messages.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      campaign.message_text || ''
    );

    await runAsync(
      `UPDATE recipients SET status = ?, last_attempt_at = ?, last_status_detail = ? WHERE id = ?`,
      ['completed', nowIso(), JSON.stringify(response), recipient.id]
    );
    await refreshCampaignCompletion(recipient.campaign_id);
    return response;
  } catch (err) {
    console.error('sendSms error', err.message, recipient);
    await scheduleRetryOrFail(recipient, campaign, err.message);
    return { error: err.message };
  }
}

app.post('/api/recipients/:id/call', basicAuth, async (req, res) => {
  const id = req.params.id;

  try {
    const recipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [id]);
    if (!recipient) return res.status(404).json({ error: 'recipient not found' });

    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });

    const campaignStatus = String(campaign.status || '').toLowerCase();
    if (campaignStatus === 'stopped' || campaignStatus === 'completed') {
      return res.status(409).json({ error: `campaign is ${campaignStatus}` });
    }

    const result = campaign.type === 'voice' ? await sendVoiceCall(recipient, campaign) : await sendSms(recipient, campaign);
    res.json({ result });
  } catch (err) {
    console.error('/api/recipients/:id/call error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/start', basicAuth, async (req, res) => {
  const campaignId = req.params.id;

  try {
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });

    const campaignStatus = String(campaign.status || '').toLowerCase();
    if (campaignStatus === 'stopped') return res.status(409).json({ error: 'Campaign is stopped. Create a new campaign to run again.' });
    if (campaignStatus === 'completed') return res.status(409).json({ error: 'Campaign is already completed.' });

    if (campaign.type === 'voice' && !campaign.voice_url && !campaign.message_text) {
      return res.status(400).json({ error: 'voice campaign requires voice_url or message_text' });
    }

    await runAsync(
      `UPDATE campaigns SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?`,
      ['running', nowIso(), campaignId]
    );

    const latestCampaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    const recipients = await allAsync(
      `SELECT * FROM recipients WHERE campaign_id = ? AND status IN ('pending', 'retry') ORDER BY id ASC`,
      [campaignId]
    );

    for (const recipient of recipients) {
      if (latestCampaign.type === 'voice') await sendVoiceCall(recipient, latestCampaign);
      else await sendSms(recipient, latestCampaign);
    }

    await refreshCampaignCompletion(campaignId);
    res.json({ started: recipients.length });
  } catch (err) {
    console.error('/api/campaigns/:id/start error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/stop', basicAuth, async (req, res) => {
  const campaignId = req.params.id;

  try {
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });

    const stoppedAt = nowIso();
    await runAsync(
      `UPDATE campaigns SET status = ?, stopped_at = COALESCE(stopped_at, ?) WHERE id = ?`,
      ['stopped', stoppedAt, campaignId]
    );

    await runAsync(
      `UPDATE recipients SET status = ?, next_attempt_at = NULL, last_status_detail = COALESCE(last_status_detail, ?) WHERE campaign_id = ? AND status IN ('pending', 'retry')`,
      ['cancelled', `Campaign stopped at ${formatToIndiaTime(stoppedAt)}`, campaignId]
    );

    const bundle = await getCampaignWithRecipients(campaignId);
    res.json({ stopped: true, campaign: normalizeCampaign(bundle.campaign, bundle.stats), stats: bundle.stats });
  } catch (err) {
    console.error('/api/campaigns/:id/stop error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plivo/webhook', express.urlencoded({ extended: true }), async (req, res) => {
  const event = req.body;

  try {
    const callUuid = event.CallUUID || event.CallUuid || event.RequestUUID || event.request_uuid;
    const callStatus = event.CallStatus || event.Status || event.Event || 'unknown';
    if (!callUuid) return res.status(400).send('missing CallUUID');

    const recipient = await getAsync(`SELECT * FROM recipients WHERE plivo_call_uuid = ?`, [callUuid]);
    if (!recipient) return res.status(404).send('recipient not found');

    await runAsync(
      `INSERT INTO call_events (recipient_id, plivo_call_uuid, event_type, details, timestamp) VALUES (?,?,?,?,?)`,
      [recipient.id, callUuid, callStatus, JSON.stringify(event), nowIso()]
    );

    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    if (!campaign) return res.status(404).send('campaign not found');

    const campaignStatus = String(campaign.status || '').toLowerCase();
    if (campaignStatus === 'stopped') {
      await runAsync(
        `UPDATE recipients SET last_status_detail = ? WHERE id = ?`,
        [JSON.stringify(event), recipient.id]
      );
      return res.send('ok');
    }

    const normalizedStatus = String(callStatus || '').toLowerCase();
    if (normalizedStatus === 'completed') {
      const bill = parseInt(event.BillDuration || event.TotalCost || '0', 10);
      if (bill > 0 || event.BillDuration === undefined) {
        await runAsync(
          `UPDATE recipients SET status = ?, last_status_detail = ?, last_attempt_at = ? WHERE id = ?`,
          ['completed', JSON.stringify(event), nowIso(), recipient.id]
        );
      } else {
        await scheduleRetryOrFail(recipient, campaign, JSON.stringify(event));
      }
    } else if (['no-answer', 'busy', 'failed', 'cancelled', 'canceled', 'timeout', 'rejected'].includes(normalizedStatus)) {
      await scheduleRetryOrFail(recipient, campaign, JSON.stringify(event));
    } else {
      await runAsync(
        `UPDATE recipients SET status = ?, last_status_detail = ?, last_attempt_at = ? WHERE id = ?`,
        ['sent', JSON.stringify(event), nowIso(), recipient.id]
      );
    }

    await refreshCampaignCompletion(recipient.campaign_id);
    res.send('ok');
  } catch (err) {
    console.error('/api/plivo/webhook error', err);
    res.status(500).send(err.message);
  }
});

app.all('/api/plivo/answer', async (req, res) => {
  const recipientId = req.query.recipient_id || (req.body && req.body.recipient_id);
  const tts = req.query.tts || (req.body && req.body.tts);
  if (!recipientId) return res.status(400).send('missing recipient_id');

  try {
    const recipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [recipientId]);
    if (!recipient) {
      res.set('Content-Type', 'application/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Speak>Message is not available.</Speak></Response>`);
    }

    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    const campaignStatus = String(campaign && campaign.status || '').toLowerCase();

    if (campaignStatus === 'stopped') {
      res.set('Content-Type', 'application/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Speak>This campaign has been stopped.</Speak></Response>`);
    }

    if ((tts === '1' || tts === 'true') || !(campaign && campaign.voice_url)) {
      const text = (campaign && campaign.message_text) ? campaign.message_text : 'Hello';
      res.set('Content-Type', 'application/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${String(text).replace(/[<>&]/g, '')}</Speak></Response>`);
    }

    res.set('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${campaign.voice_url}</Play></Response>`);
  } catch (err) {
    console.error('/api/plivo/answer error', err);
    res.status(500).send(err.message);
  }
});

function buildCampaignRecipientCsv(campaign, recipients) {
  const header = [
    'campaign_id',
    'campaign_name',
    'campaign_status',
    'phone_number',
    'recipient_status',
    'attempts',
    'last_attempt_ist',
    'next_attempt_ist',
    'last_status_detail',
  ];

  const lines = recipients.map((recipient) => [
    campaign.id,
    campaign.name,
    campaign.status,
    recipient.phone_number,
    recipient.status,
    recipient.attempts || 0,
    formatToIndiaTime(recipient.last_attempt_at),
    formatToIndiaTime(recipient.next_attempt_at),
    recipient.last_status_detail || '',
  ].map(csvEscape).join(','));

  return [header.join(','), ...lines].join('\n');
}

async function buildCampaignLogsCsv(campaignId) {
  const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
  if (!campaign) return null;

  const recipients = await allAsync(`SELECT * FROM recipients WHERE campaign_id = ? ORDER BY id ASC`, [campaignId]);
  const events = await allAsync(
    `SELECT ce.*, r.phone_number, r.status AS recipient_status
     FROM call_events ce
     LEFT JOIN recipients r ON r.id = ce.recipient_id
     WHERE r.campaign_id = ?
     ORDER BY ce.timestamp ASC, ce.id ASC`,
    [campaignId]
  );

  const lines = [];
  lines.push([
    'record_type', 'campaign_id', 'campaign_name', 'campaign_status', 'phone_number', 'recipient_status', 'attempts',
    'event_type', 'timestamp_ist', 'last_attempt_ist', 'next_attempt_ist', 'plivo_call_uuid', 'details'
  ].join(','));

  for (const recipient of recipients) {
    lines.push([
      'recipient',
      campaign.id,
      campaign.name,
      campaign.status || '',
      recipient.phone_number,
      recipient.status || '',
      recipient.attempts || 0,
      '',
      '',
      formatToIndiaTime(recipient.last_attempt_at),
      formatToIndiaTime(recipient.next_attempt_at),
      recipient.plivo_call_uuid || '',
      recipient.last_status_detail || '',
    ].map(csvEscape).join(','));
  }

  for (const event of events) {
    lines.push([
      'event',
      campaign.id,
      campaign.name,
      campaign.status || '',
      event.phone_number || '',
      event.recipient_status || '',
      '',
      event.event_type || '',
      formatToIndiaTime(event.timestamp),
      '',
      '',
      event.plivo_call_uuid || '',
      event.details || '',
    ].map(csvEscape).join(','));
  }

  return lines.join('\n');
}

app.get('/api/campaigns/:id/export', basicAuth, async (req, res) => {
  const campaignId = req.params.id;
  const format = (req.query.format || 'csv').toLowerCase();

  try {
    const bundle = await refreshCampaignCompletion(campaignId);
    if (!bundle) return res.status(404).json({ error: 'campaign not found' });

    const campaign = normalizeCampaign(bundle.campaign, bundle.stats);
    const recipients = bundle.recipients.map(normalizeRecipient);

    if (format === 'json') {
      return res.json({ campaign, recipients, stats: bundle.stats, timezone: INDIA_TIME_ZONE });
    }

    const csv = buildCampaignRecipientCsv(campaign, recipients);
    res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_recipients_IST.csv"`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csv);
  } catch (err) {
    console.error('/api/campaigns/:id/export error', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id/logs/export', basicAuth, async (req, res) => {
  const campaignId = req.params.id;

  try {
    const csv = await buildCampaignLogsCsv(campaignId);
    if (!csv) return res.status(404).json({ error: 'campaign not found' });

    res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_logs_IST.csv"`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csv);
  } catch (err) {
    console.error('/api/campaigns/:id/logs/export error', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id/status', basicAuth, async (req, res) => {
  const campaignId = req.params.id;

  try {
    const bundle = await refreshCampaignCompletion(campaignId);
    if (!bundle) return res.status(404).json({ error: 'campaign not found' });

    const campaign = normalizeCampaign(bundle.campaign, bundle.stats);
    const recipients = bundle.recipients.map(normalizeRecipient);
    res.json({ campaign, recipients, stats: bundle.stats, timezone: INDIA_TIME_ZONE });
  } catch (err) {
    console.error('/api/campaigns/:id/status error', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id/failed/export', basicAuth, async (req, res) => {
  const campaignId = req.params.id;

  try {
    const rows = await allAsync(
      `SELECT * FROM recipients WHERE campaign_id = ? AND status IN ('failed', 'failed_permanent') ORDER BY id ASC`,
      [campaignId]
    );

    const header = ['phone_number', 'status', 'attempts', 'last_attempt_ist', 'last_status_detail'];
    const lines = rows.map((row) => [
      row.phone_number,
      row.status,
      row.attempts || 0,
      formatToIndiaTime(row.last_attempt_at),
      row.last_status_detail || '',
    ].map(csvEscape).join(','));

    res.setHeader('Content-Disposition', `attachment; filename="failed_campaign_${campaignId}_IST.csv"`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.send([header.join(','), ...lines].join('\n'));
  } catch (err) {
    console.error('/api/campaigns/:id/failed/export error', err);
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await init();
  app.listen(PORT, () => console.log(`Server listening on ${PORT}. Display timezone: ${INDIA_TIME_ZONE}`));
})();
