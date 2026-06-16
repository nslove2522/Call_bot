require('dotenv').config();
const axios = require('axios');
const { allAsync, runAsync } = require('./db');
const path = require('path');

const INTERVAL = (parseInt(process.env.RETRY_WORKER_INTERVAL_SECONDS || '60', 10)) * 1000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

async function processRetries() {
  try {
    // fetch all rows marked 'retry' and make time decision in JS (handles numeric ms or IST strings)
    const rows = await allAsync(`SELECT recipients.* FROM recipients JOIN campaigns ON campaigns.id = recipients.campaign_id WHERE recipients.status = 'retry'`);
    for (const r of rows) {
      try {
        let shouldTrigger = false;
        if (!r.next_attempt_at) {
          shouldTrigger = true;
        } else {
          // next_attempt_at may be stored as epoch ms (string) or as an IST string 'YYYY-MM-DD HH:MM:SS'
          let nextMs = null;
          if (/^\d+$/.test(String(r.next_attempt_at))) {
            nextMs = Number(r.next_attempt_at);
          } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(r.next_attempt_at))) {
            // parse IST string to epoch ms: Date.UTC(...) - offset
            const parts = String(r.next_attempt_at).split(' ');
            const dateParts = parts[0].split('-').map(Number);
            const timeParts = parts[1].split(':').map(Number);
            const offsetMs = (5 * 60 + 30) * 60 * 1000;
            nextMs = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]) - offsetMs;
          } else {
            // try Date.parse fallback
            const p = Date.parse(String(r.next_attempt_at));
            if (!isNaN(p)) nextMs = p;
          }
          if (nextMs !== null && nextMs <= Date.now()) shouldTrigger = true;
        }

        if (!shouldTrigger) continue;

        // mark as pending and then trigger the call for this recipient immediately
        await runAsync(`UPDATE recipients SET status = 'pending' WHERE id = ?`, [r.id]);
        try {
          // call local endpoint to trigger a single call; use basic auth
          const url = `${BASE_URL.replace(/\/$/, '')}/api/recipients/${r.id}/call`;
          await axios.post(url, {}, { auth: { username: ADMIN_USER, password: ADMIN_PASS }, timeout: 15000 });
          console.log('Triggered retry call for recipient', r.id);
        } catch (err) {
          console.error('Error triggering retry call for recipient', r.id, err.message || err);
        }
      } catch (err) {
        console.error('Error evaluating retry for recipient', r.id, err.message || err);
      }
    }
  } catch (err) {
    console.error('retry worker error', err);
  }
}

setInterval(processRetries, INTERVAL);

module.exports = { processRetries };
