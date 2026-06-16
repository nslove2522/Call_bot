require('dotenv').config();
const { getAsync, runAsync } = require('../db');

const PHONE = process.argv[2];
const MINUTES = parseInt(process.argv[3] || '5', 10);

if (!PHONE) {
  console.error('Usage: node schedule_retry_for_phone.js <E.164 phone> [minutes]');
  process.exit(1);
}

(async () => {
  try {
    let r = await getAsync(`SELECT * FROM recipients WHERE phone_number = ? ORDER BY id DESC LIMIT 1`, [PHONE]);
    if (!r) {
      const campaign = await getAsync(`SELECT id FROM campaigns ORDER BY id LIMIT 1`);
      if (!campaign) throw new Error('No campaign found to attach temporary recipient');
      const res = await runAsync(`INSERT INTO recipients (campaign_id, phone_number, status) VALUES (?,?,?)`, [campaign.id, PHONE, 'retry']);
      r = { id: res.lastID, phone_number: PHONE, campaign_id: campaign.id };
      console.log('Inserted temporary recipient id', r.id);
    }

    const next = Date.now() + MINUTES * 60 * 1000;
    await runAsync(`UPDATE recipients SET status = ?, next_attempt_at = ? WHERE id = ?`, ['retry', String(next), r.id]);
    console.log(`Scheduled retry for ${PHONE} (recipient ${r.id}) at ${new Date(next).toISOString()} (epoch-ms ${next})`);
    process.exit(0);
  } catch (e) {
    console.error('Error scheduling retry:', e.message || e);
    process.exit(1);
  }
})();
