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
// start retry scheduler
try { require('./scheduler'); } catch (e) { console.warn('scheduler not loaded', e.message); }

const PLIVO_AUTH_ID = process.env.PLIVO_AUTH_ID;
const PLIVO_AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN;
const PLIVO_SOURCE_NUMBER = process.env.PLIVO_SOURCE_NUMBER;

let plivoClient = null;
if (PLIVO_AUTH_ID && PLIVO_AUTH_TOKEN) {
  const plivo = require('plivo');
  plivoClient = new plivo.Client(PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN);
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const upload = multer({ dest: path.join(__dirname, 'tmp') });
if (!fs.existsSync(path.join(__dirname, 'tmp'))) fs.mkdirSync(path.join(__dirname, 'tmp'));

// ensure uploads directory and serve static files for voice files
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Custom middleware to disable Range requests for audio files (Plivo compatibility)
app.use('/uploads', (req, res, next) => {
  if (req.path.endsWith('.mp3') || req.path.endsWith('.wav')) {
    res.set('Accept-Ranges', 'none');
    res.set('Cache-Control', 'no-cache, public');
  }
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/uploads', basicAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${sanitized}`;
    const destPath = path.join(UPLOADS_DIR, filename);
    fs.renameSync(req.file.path, destPath);
    const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
    const url = `${baseUrl}/uploads/${filename}`;
    console.log('/api/uploads file saved', { filename, destPath, url });
    res.json({ url });
  } catch (err) {
    console.error('/api/uploads error', err);
    res.status(500).json({ error: err.message });
  }
});

// request logging
app.use(morgan('combined'));

const PORT = process.env.PORT || 3001;

// simple diagnostic endpoint to fetch an audio URL and return response headers/status
const https = require('https');
const http = require('http');

// helper: format UTC timestamp string to India time (Asia/Kolkata) as 'YYYY-MM-DD HH:MM:SS'
function formatToIST(ts) {
  if (!ts) return '';
  try {
    // accept numeric epoch (ms) or ISO string or our backfilled 'YYYY-MM-DD HH:MM:SS' strings
    let d;
    if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts))) {
      d = new Date(Number(ts));
    } else if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
      // this format is stored as IST in older rows (YYYY-MM-DD HH:MM:SS). Parse as IST and convert to Date
      const parts = ts.split(' ');
      const dateParts = parts[0].split('-').map(Number);
      const timeParts = parts[1].split(':').map(Number);
      // Convert IST (UTC+5:30) to UTC ms: Date.UTC(...) - offset
      const offsetMs = (5 * 60 + 30) * 60 * 1000;
      d = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]) - offsetMs);
    } else {
      const s = (typeof ts === 'string' && (ts.endsWith('Z') || ts.includes('T'))) ? ts : (ts + 'Z');
      d = new Date(s);
    }
    const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    const map = {};
    parts.forEach(p => { if (p.type && p.value) map[p.type] = p.value });
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  } catch (e) { return ts }
}

app.get('/api/check-audio', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing url query param' });
  try {
    const client = url.startsWith('https://') ? https : http;
    const reqOpts = new URL(url);
    const request = client.request(reqOpts, (resp) => {
      const headers = resp.headers;
      const statusCode = resp.statusCode;
      // respond immediately with headers/status so caller (and Plivo) can validate accessibility
      res.json({ url, statusCode, headers });
      // destroy response to avoid downloading body
      try { resp.destroy(); } catch (e) { /* ignore */ }
    });
    request.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    request.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function basicAuth(req, res, next) {
  const auth = req.headers['authorization'];
  console.log('basicAuth check', { path: req.path, method: req.method, authHeader: auth ? auth.substring(0, 20) + '...' : 'MISSING', adminUser: process.env.ADMIN_USER, adminPass: process.env.ADMIN_PASS });
  if (!auth || !auth.startsWith('Basic ')) {
    console.log('basicAuth failed: missing or invalid header format');
    return res.status(401).send('Unauthorized');
  }
  const encoded = auth.split(' ')[1];
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  console.log('basicAuth decoded', { user, pass, expectedUser: process.env.ADMIN_USER, expectedPass: process.env.ADMIN_PASS });
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
    console.log('basicAuth SUCCESS');
    return next();
  }
  console.log('basicAuth failed: credentials do not match');
  return res.status(401).send('Unauthorized');
}

app.get('/', (req, res) => res.send('Voice call backend running'));

app.get('/test-upload', async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
    res.json({
      uploadDir: UPLOADS_DIR,
      files: files.map(f => ({ name: f, url: `${baseUrl}/uploads/${f}` }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns', basicAuth, async (req, res) => {
  const { name, type, message_text, voice_url, retry_delay_minutes, max_attempts } = req.body;
  try {
    const createdAtIst = formatToIST(new Date().toISOString());
    const r = await runAsync(
      `INSERT INTO campaigns (name, type, message_text, voice_url, retry_delay_minutes, max_attempts, created_at) VALUES (?,?,?,?,?,?,?)`,
      // default retry_delay_minutes: 5 minutes, default max_attempts: 4
      [name, type, message_text, voice_url, retry_delay_minutes || 5, max_attempts || 4, createdAtIst]
    );
    res.json({ id: r.lastID });
  } catch (err) {
    console.error('POST /api/campaigns error', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/recipients/upload', basicAuth, upload.single('file'), async (req, res) => {
  const campaignId = req.params.id;
  // Accept CSV file upload or JSON body with numbers array
  try {
    if (req.file) {
      const filePath = req.file.path;
      const content = fs.readFileSync(filePath, 'utf8');
      csvParse(content, { trim: true }, async (err, records) => {
        if (err) {
          console.error('CSV parse error', err);
          return res.status(400).json({ error: err.message });
        }
        const inserted = [];
        for (const row of records) {
          const num = row[0];
          try {
            const r = await runAsync(`INSERT INTO recipients (campaign_id, phone_number) VALUES (?,?)`, [campaignId, num]);
            inserted.push({ id: r.lastID, phone_number: num });
          } catch (e) {
            console.error('Insert recipient error', e, row);
          }
        }
        fs.unlinkSync(filePath);
        res.json({ inserted: inserted.length });
      });
    } else if (req.body.numbers) {
      const numbers = Array.isArray(req.body.numbers) ? req.body.numbers : [];
      const inserted = [];
      for (const num of numbers) {
        const r = await runAsync(`INSERT INTO recipients (campaign_id, phone_number) VALUES (?,?)`, [campaignId, num]);
        inserted.push({ id: r.lastID, phone_number: num });
      }
      res.json({ inserted: inserted.length });
    } else {
      res.status(400).json({ error: 'No file or numbers provided' });
    }
  } catch (err) {
    console.error('/api/campaigns/:id/recipients/upload error', err);
    res.status(500).json({ error: err.message });
  }
});

async function sendVoiceCall(recipient, campaign) {
  // If plivo configured, create call and store call uuid
  if (!plivoClient) {
    // simulate: mark sent but do NOT increment attempts here; attempts are incremented on failure
    const nowIst = formatToIST(new Date().toISOString());
    await runAsync(`UPDATE recipients SET status = ?, last_attempt_at = ? WHERE id = ?`, ['sent', nowIst, recipient.id]);
    return { simulated: true };
  }
  const answerUrl = `${process.env.BASE_URL || 'http://example.com'}/api/plivo/answer?recipient_id=${recipient.id}`;
  console.log('Creating Plivo call', { to: recipient.phone_number, recipientId: recipient.id, answerUrl });
  try {
    const options = {
      answer_method: 'GET',
      hangup_url: `${process.env.BASE_URL || 'http://example.com'}/api/plivo/webhook`,
      hangup_method: 'POST'
    };
    const res = await plivoClient.calls.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      answerUrl,
      options
    );
    console.log('Plivo call create response:', res);
    // attempt to extract uuid
    const uuid = res && (res.request_uuid || res.requestUuid || res.request_uuid) ? (res.request_uuid || res.requestUuid || res.request_uuid) : null;
    const nowIst = formatToIST(new Date().toISOString());
    if (uuid) {
      await runAsync(`UPDATE recipients SET plivo_call_uuid = ?, status = ?, last_attempt_at = ? WHERE id = ?`, [uuid, 'sent', nowIst, recipient.id]);
    } else {
      // still mark as sent but DO NOT increment attempts here; store response
      await runAsync(`UPDATE recipients SET status = ?, last_status_detail = ? , last_attempt_at = ? WHERE id = ?`, ['sent', JSON.stringify(res), nowIst, recipient.id]);
    }
    return res;
  } catch (err) {
    console.error('sendVoiceCall error', err, recipient);
    await runAsync(`UPDATE recipients SET status = ?, last_status_detail = ? WHERE id = ?`, ['retry', err.message, recipient.id]);
    return { error: err.message };
  }
}

// test endpoint to trigger a single call for debugging
app.post('/api/recipients/:id/call', basicAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const recipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [id]);
    if (!recipient) return res.status(404).json({ error: 'recipient not found' });
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    const result = await sendVoiceCall(recipient, campaign);
    res.json({ result });
  } catch (err) {
    console.error('/api/recipients/:id/call error', err);
    res.status(500).json({ error: err.message });
  }
});

async function sendSms(recipient, campaign) {
  if (!plivoClient) {
    // simulated SMS: mark sent but do not increment attempts here
    const nowIst = formatToIST(new Date().toISOString());
    await runAsync(`UPDATE recipients SET status = ?, last_attempt_at = ? WHERE id = ?`, ['sent', nowIst, recipient.id]);
    return { simulated: true };
  }
  try {
    const res = await plivoClient.messages.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      campaign.message_text || ''
    );
    await runAsync(`UPDATE recipients SET status = ?, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, ['sent', recipient.id]);
    return res;
  } catch (err) {
    console.error('sendSms error', err, recipient);
    await runAsync(`UPDATE recipients SET status = ?, last_status_detail = ? WHERE id = ?`, ['failed', err.message, recipient.id]);
    return { error: err.message };
  }
}

app.post('/api/campaigns/:id/start', basicAuth, async (req, res) => {
  const campaignId = req.params.id;
  try {
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });
    // validate for voice campaigns that we have a voice source
    if (campaign.type === 'voice' && !campaign.voice_url && !campaign.message_text) {
      return res.status(400).json({ error: 'voice campaign requires campaign.voice_url or message_text' });
    }
    const recipients = await allAsync(`SELECT * FROM recipients WHERE campaign_id = ? AND status = 'pending'`, [campaignId]);
    for (const r of recipients) {
      if (campaign.type === 'voice') {
        await sendVoiceCall(r, campaign);
      } else {
        await sendSms(r, campaign);
      }
    }
    res.json({ started: recipients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plivo/webhook', express.urlencoded({ extended: true }), async (req, res) => {
  // Plivo will POST call status updates. This handler should be secured/validated.
  const event = req.body;
  // Example fields: CallUUID, CallStatus, To
  try {
    const callUuid = event.CallUUID || event.CallUUID;
    const callStatus = event.CallStatus || event.CallStatus;
    if (!callUuid) return res.status(400).send('missing CallUUID');
    // find recipient by plivo_call_uuid
    const recipient = await getAsync(`SELECT * FROM recipients WHERE plivo_call_uuid = ?`, [callUuid]);
    if (!recipient) return res.status(404).send('recipient not found');
    const eventTs = formatToIST(new Date().toISOString());
    await runAsync(`INSERT INTO call_events (recipient_id, plivo_call_uuid, event_type, details, timestamp) VALUES (?,?,?,?,?)`, [recipient.id, callUuid, callStatus, JSON.stringify(event), eventTs]);

    // load campaign to know retry settings
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    const maxAttempts = (campaign && campaign.max_attempts) ? parseInt(campaign.max_attempts, 10) : 4;
    const retryDelayMinutes = (campaign && campaign.retry_delay_minutes) ? parseInt(campaign.retry_delay_minutes, 10) : 5;

    async function markForRetryOrFail() {
      // increment attempts now (count failure) and write IST last_attempt_at
      const nowIst = formatToIST(new Date().toISOString());
      await runAsync(`UPDATE recipients SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ?`, [nowIst, recipient.id]);
      const updated = await getAsync(`SELECT attempts FROM recipients WHERE id = ?`, [recipient.id]);
      const attempts = (updated && updated.attempts) ? updated.attempts : 0;

      if (attempts >= maxAttempts) {
        // mark permanent failure and export to CSV for download
        await runAsync(`UPDATE recipients SET status = ?, last_status_detail = ? WHERE id = ?`, ['failed_permanent', JSON.stringify(event), recipient.id]);
        try {
          // append to CSV in uploads directory
          const csvPath = path.join(UPLOADS_DIR, `failed_campaign_${recipient.campaign_id}.csv`);
          const header = 'phone_number,status,attempts,last_attempt_at,last_status_detail\n';
          const updatedRecipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [recipient.id]);
          const lastAttemptIst = updatedRecipient && updatedRecipient.last_attempt_at ? formatToIST(updatedRecipient.last_attempt_at) : '';
          const line = `${recipient.phone_number},failed_permanent,${attempts},${lastAttemptIst},"${(JSON.stringify(event)||'').replace(/"/g,'""')}"\n`;
          if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, header);
          fs.appendFileSync(csvPath, line);
          console.log('Appended failed recipient to', csvPath);
        } catch (e) {
          console.error('Error exporting failed recipient to CSV', e);
        }
      } else {
        // schedule next attempt using epoch ms to avoid timezone parsing issues
        const nextMs = Date.now() + (retryDelayMinutes * 60 * 1000);
        await runAsync(`UPDATE recipients SET status = ?, next_attempt_at = ? WHERE id = ?`, ['retry', String(nextMs), recipient.id]);
      }
    }

    if (callStatus === 'completed') {
      // mark completed only if full duration; Plivo provides BillDuration
      const bill = parseInt(event.BillDuration || '0', 10);
      if (bill > 0) {
        await runAsync(`UPDATE recipients SET status = ? WHERE id = ?`, ['completed', recipient.id]);
      } else {
        // no answer or 0 seconds
        await markForRetryOrFail();
      }
    } else if (callStatus === 'no-answer' || callStatus === 'busy' || callStatus === 'failed' || callStatus === 'cancelled' || callStatus === 'canceled') {
      await markForRetryOrFail();
    }
    res.send('ok');
  } catch (err) {
    console.error('/api/plivo/webhook error', err);
    res.status(500).send(err.message);
  }
});

// endpoint to download failed recipients CSV for a campaign
app.get('/api/campaigns/:id/failed/export', basicAuth, async (req, res) => {
  const campaignId = req.params.id;
  try {
    const csvPath = path.join(UPLOADS_DIR, `failed_campaign_${campaignId}.csv`);
    if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'no failed export found' });
    return res.download(csvPath);
  } catch (err) {
    console.error('/api/campaigns/:id/failed/export error', err);
    res.status(500).json({ error: err.message });
  }
});

app.all('/api/plivo/answer', async (req, res) => {
  // Plivo will request this URL when answering a call. We accept GET or POST and return XML to play a file or speak the campaign message.
  const recipientId = req.query.recipient_id || req.body && req.body.recipient_id;
  const tts = req.query.tts || req.body && req.body.tts;
  if (!recipientId) return res.status(400).send('missing recipient_id');
  try {
    console.log('/api/plivo/answer incoming request', { method: req.method, ip: req.ip, query: req.query });
    const recipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [recipientId]);
    if (!recipient) {
      console.warn(`/api/plivo/answer recipient ${recipientId} not found - returning default Speak to avoid Plivo error`);
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>We're sorry, the message is not available.</Speak></Response>`;
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    console.log('/api/plivo/answer campaign data', { recipientId, campaignId: recipient.campaign_id, campaign });
    
    // If caller explicitly requests TTS (for debugging), return <Speak>
    if (tts === '1' || tts === 'true') {
      const text = (campaign && campaign.message_text) ? campaign.message_text : 'Hello';
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak></Response>`;
      console.log('/api/plivo/answer returning Speak XML (forced by tts param)', { recipientId, text });
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    if (campaign && campaign.voice_url) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${campaign.voice_url}</Play></Response>`;
      console.log('/api/plivo/answer returning Play XML', { recipientId, voice_url: campaign.voice_url, xmlLength: xml.length });
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    const text = (campaign && campaign.message_text) ? campaign.message_text : 'Hello';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak></Response>`;
    console.log('/api/plivo/answer returning Speak XML (fallback)', { recipientId, text });
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('/api/plivo/answer error', err);
    res.status(500).send(err.message);
  }
});
 

app.get('/api/campaigns/:id/export', basicAuth, async (req, res) => {
  const campaignId = req.params.id;
  const format = (req.query.format || 'csv').toLowerCase();
  try {
    const rows = await allAsync(`SELECT phone_number, status, attempts, last_attempt_at, last_status_detail FROM recipients WHERE campaign_id = ?`, [campaignId]);
    // convert timestamps to India time for CSV export and JSON
    const normRows = rows.map(r => ({
      ...r,
      last_attempt_at: formatToIST(r.last_attempt_at),
      next_attempt_at: formatToIST(r.next_attempt_at)
    }));
    if (format === 'csv') {
      const header = 'phone_number,status,attempts,last_attempt_at,last_status_detail\n';
      const lines = normRows.map(r => `${r.phone_number},${r.status},${r.attempts},${r.last_attempt_at || ''},"${(r.last_status_detail||'').replace(/"/g,'""')}"`).join('\n');
      const csv = header + lines;
      res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}.csv"`);
      res.set('Content-Type', 'text/csv');
      return res.send(csv);
    }
    res.json({ campaignId, recipients: normRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id/status', basicAuth, async (req, res) => {
  const campaignId = req.params.id;
  try {
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });
    const recipients = await allAsync(`SELECT * FROM recipients WHERE campaign_id = ?`, [campaignId]);
    const normRecipients = recipients.map(r => ({
      ...r,
      last_attempt_at: formatToIST(r.last_attempt_at),
      next_attempt_at: formatToIST(r.next_attempt_at)
    }));
    res.json({ campaign, recipients: normRecipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await init();
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
})();
