require('dotenv').config();
const { getAsync, runAsync } = require('../db');

const PHONE = process.argv[2];
const MINUTES = parseInt(process.argv[3] || '5', 10);
const MAX = parseInt(process.argv[4] || '4', 10);

if (!PHONE) {
  console.error('Usage: node set_campaign_retry_for_phone.js <E.164 phone> [minutes] [max_attempts]');
  process.exit(1);
}

(async () => {
  try {
    const r = await getAsync(`SELECT * FROM recipients WHERE phone_number = ? ORDER BY id DESC LIMIT 1`, [PHONE]);
    if (!r) throw new Error('recipient not found for ' + PHONE);
    const campaign = await getAsync(`SELECT * FROM campaigns WHERE id = ?`, [r.campaign_id]);
    if (!campaign) throw new Error('campaign not found for id ' + r.campaign_id);
    await runAsync(`UPDATE campaigns SET retry_delay_minutes = ?, max_attempts = ? WHERE id = ?`, [MINUTES, MAX, campaign.id]);
    console.log(`Updated campaign ${campaign.id} retry_delay_minutes=${MINUTES} max_attempts=${MAX}`);
    // ensure recipient is set to retry and next_attempt_at is scheduled
    const next = Date.now() + MINUTES * 60 * 1000;
    await runAsync(`UPDATE recipients SET status = ?, next_attempt_at = ? WHERE id = ?`, ['retry', String(next), r.id]);
    console.log(`Set recipient ${r.id} to retry at ${new Date(next).toISOString()}`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
})();
