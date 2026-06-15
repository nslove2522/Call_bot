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
app.use('/uploads', express.static(UPLOADS_DIR));

// request logging
app.use(morgan('combined'));

const PORT = process.env.PORT || 3001;

function basicAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) return res.status(401).send('Unauthorized');
  const encoded = auth.split(' ')[1];
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
  return res.status(401).send('Unauthorized');
}

app.get('/', (req, res) => res.send('Voice call backend running'));

app.post('/api/campaigns', basicAuth, async (req, res) => {
  const { name, type, message_text, voice_url, retry_delay_minutes, max_attempts } = req.body;
  try {
    const r = await runAsync(
      `INSERT INTO campaigns (name, type, message_text, voice_url, retry_delay_minutes, max_attempts) VALUES (?,?,?,?,?,?)`,
      [name, type, message_text, voice_url, retry_delay_minutes || 60, max_attempts || 3]
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
    // simulate
    await runAsync(`UPDATE recipients SET status = ?, attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, ['sent', recipient.id]);
    return { simulated: true };
  }
  const answerUrl = `${process.env.BASE_URL || 'http://example.com'}/api/plivo/answer?recipient_id=${recipient.id}`;
  console.log('Creating Plivo call', { to: recipient.phone_number, recipientId: recipient.id, answerUrl });
  try {
    const res = await plivoClient.calls.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      [answerUrl]
    );
    console.log('Plivo call create response:', res);
    // attempt to extract uuid
    const uuid = res && (res.request_uuid || res.requestUuid || res.request_uuid) ? (res.request_uuid || res.requestUuid || res.request_uuid) : null;
    if (uuid) {
      await runAsync(`UPDATE recipients SET plivo_call_uuid = ?, status = ?, attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, [uuid, 'sent', recipient.id]);
    } else {
      // still mark as sent attempt but store response
      await runAsync(`UPDATE recipients SET status = ?, attempts = attempts + 1, last_status_detail = ? , last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, ['sent', JSON.stringify(res), recipient.id]);
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
    await runAsync(`UPDATE recipients SET status = ?, attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, ['sent', recipient.id]);
    return { simulated: true };
  }
  try {
    const res = await plivoClient.messages.create(
      PLIVO_SOURCE_NUMBER,
      recipient.phone_number,
      campaign.message_text || ''
    );
    await runAsync(`UPDATE recipients SET status = ?, attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, ['sent', recipient.id]);
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
    await runAsync(`INSERT INTO call_events (recipient_id, plivo_call_uuid, event_type, details) VALUES (?,?,?,?)`, [recipient.id, callUuid, callStatus, JSON.stringify(event)]);
    if (callStatus === 'completed') {
      // mark completed only if full duration; Plivo provides BillDuration
      const bill = parseInt(event.BillDuration || '0', 10);
      if (bill > 0) {
        await runAsync(`UPDATE recipients SET status = ? WHERE id = ?`, ['completed', recipient.id]);
      } else {
        // no answer or 0 seconds
        await runAsync(`UPDATE recipients SET status = ?, next_attempt_at = datetime('now', '+' || (SELECT retry_delay_minutes FROM campaigns WHERE id = recipients.campaign_id) || ' minutes') WHERE id = ?`, ['retry', recipient.id]);
      }
    } else if (callStatus === 'no-answer' || callStatus === 'busy' || callStatus === 'failed') {
      await runAsync(`UPDATE recipients SET status = ?, next_attempt_at = datetime('now', '+' || (SELECT retry_delay_minutes FROM campaigns WHERE id = recipients.campaign_id) || ' minutes') WHERE id = ?`, ['retry', recipient.id]);
    }
    res.send('ok');
  } catch (err) {
    console.error('/api/plivo/webhook error', err);
    res.status(500).send(err.message);
  }
});

app.all('/api/plivo/answer', async (req, res) => {
  // Plivo will request this URL when answering a call. We accept GET or POST and return XML to play a file or speak the campaign message.
  const recipientId = req.query.recipient_id || req.body && req.body.recipient_id;
  const tts = req.query.tts || req.body && req.body.tts;
  if (!recipientId) return res.status(400).send('missing recipient_id');
  try {
    console.log('/api/plivo/answer incoming request', { method: req.method, ip: req.ip, headers: req.headers, query: req.query, body: req.body });
    const recipient = await getAsync(`SELECT * FROM recipients WHERE id = ?`, [recipientId]);
    if (!recipient) {
      console.warn(`/api/plivo/answer recipient ${recipientId} not found - returning default Speak to avoid Plivo error`);
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>We're sorry, the message is not available.</Speak></Response>`;
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [recipient.campaign_id]);
    // If caller explicitly requests TTS (for debugging), return <Speak>
    if (tts === '1' || tts === 'true') {
      const text = (campaign && campaign.message_text) ? campaign.message_text : 'Hello';
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak></Response>`;
      console.log('/api/plivo/answer returning Speak XML (forced by tts param)', { recipientId, text, xml });
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    if (campaign && campaign.voice_url) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${campaign.voice_url}</Play></Response>`;
      console.log('/api/plivo/answer returning Play XML', { recipientId, voice_url: campaign.voice_url, xml });
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    const text = (campaign && campaign.message_text) ? campaign.message_text : 'Hello';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak></Response>`;
    console.log('/api/plivo/answer returning Speak XML', { recipientId, text, xml });
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
    if (format === 'csv') {
      const header = 'phone_number,status,attempts,last_attempt_at,last_status_detail\n';
      const lines = rows.map(r => `${r.phone_number},${r.status},${r.attempts},${r.last_attempt_at || ''},"${(r.last_status_detail||'').replace(/"/g,'""')}"`).join('\n');
      const csv = header + lines;
      res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}.csv"`);
      res.set('Content-Type', 'text/csv');
      return res.send(csv);
    }
    res.json(rows);
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
    res.json({ campaign, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await init();
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
})();
