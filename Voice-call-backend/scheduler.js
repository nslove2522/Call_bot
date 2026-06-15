require('dotenv').config();
const { allAsync, runAsync } = require('./db');

const INTERVAL = (parseInt(process.env.RETRY_WORKER_INTERVAL_SECONDS || '60', 10)) * 1000;

async function processRetries() {
  try {
    const rows = await allAsync(`SELECT recipients.* FROM recipients JOIN campaigns ON campaigns.id = recipients.campaign_id WHERE recipients.status = 'retry' AND (recipients.next_attempt_at IS NULL OR recipients.next_attempt_at <= datetime('now'))`);
    for (const r of rows) {
      // simplistic: mark as pending so manual or start endpoint can pick it up
      await runAsync(`UPDATE recipients SET status = 'pending' WHERE id = ?`, [r.id]);
    }
  } catch (err) {
    console.error('retry worker error', err);
  }
}

setInterval(processRetries, INTERVAL);

module.exports = { processRetries };
