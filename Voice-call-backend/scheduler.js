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
    const rows = await allAsync(`SELECT recipients.* FROM recipients JOIN campaigns ON campaigns.id = recipients.campaign_id WHERE recipients.status = 'retry' AND (recipients.next_attempt_at IS NULL OR recipients.next_attempt_at <= datetime('now'))`);
    for (const r of rows) {
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
    }
  } catch (err) {
    console.error('retry worker error', err);
  }
}

setInterval(processRetries, INTERVAL);

module.exports = { processRetries };
