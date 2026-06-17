require('dotenv').config();
const axios = require('axios');
const { allAsync, runAsync } = require('./db');

const INTERVAL_SECONDS = Number(process.env.RETRY_WORKER_INTERVAL_SECONDS || 60);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

function getAuthHeader() {
  if (!ADMIN_USER || !ADMIN_PASS) return {};
  const token = Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function parseDueTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

async function processRetries() {
  try {
    const rows = await allAsync(
      `SELECT id, next_attempt_at FROM recipients WHERE status = 'retry'`,
      []
    );

    for (const row of rows) {
      const nextAttemptMs = parseDueTime(row.next_attempt_at);
      if (nextAttemptMs && nextAttemptMs > Date.now()) continue;

      await runAsync(
        `UPDATE recipients SET status = ? WHERE id = ?`,
        ['pending', row.id]
      );

      await axios.post(
        `${BASE_URL}/api/recipients/${row.id}/call`,
        {},
        { headers: getAuthHeader(), timeout: 30000 }
      );
    }
  } catch (err) {
    console.error('Retry worker error:', err.message);
  }
}

if (INTERVAL_SECONDS > 0) {
  setInterval(processRetries, INTERVAL_SECONDS * 1000);
  setTimeout(processRetries, 5000);
  console.log(`Retry worker started. Interval: ${INTERVAL_SECONDS}s`);
}

module.exports = { processRetries };
