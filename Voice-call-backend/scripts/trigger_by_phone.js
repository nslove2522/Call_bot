require('dotenv').config();
const axios = require('axios');
const { getAsync, allAsync, runAsync } = require('../db');

const PHONE = process.argv[2] || '918056593498';
const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

(async () => {
  try {
    // try to find a pending or retry recipient first
    let r = await getAsync(`SELECT * FROM recipients WHERE phone_number = ? AND status IN ('pending','retry') ORDER BY id LIMIT 1`, [PHONE]);
    if (!r) r = await getAsync(`SELECT * FROM recipients WHERE phone_number = ? ORDER BY id LIMIT 1`, [PHONE]);
    if (!r) {
      // insert a temporary recipient
      const campaign = await getAsync(`SELECT id FROM campaigns ORDER BY id LIMIT 1`);
      const campaignId = campaign ? campaign.id : null;
      if (!campaignId) throw new Error('No campaign found to attach temporary recipient');
      const res = await runAsync(`INSERT INTO recipients (campaign_id, phone_number, status) VALUES (?,?,?)`, [campaignId, PHONE, 'pending']);
      r = { id: res.lastID, phone_number: PHONE, campaign_id: campaignId };
      console.log('Inserted temporary recipient id', r.id);
    }

    console.log('Triggering call for recipient', r.id, r.phone_number);
    const url = `${BASE}/api/recipients/${r.id}/call`;
    const resp = await axios.post(url, {}, { auth: { username: ADMIN_USER, password: ADMIN_PASS }, timeout: 20000 });
    console.log('Call API response:', resp.data);
    process.exit(0);
  } catch (e) {
    console.error('Trigger failed', e.message || e);
    if (e.response) console.error('Status', e.response.status, e.response.data);
    process.exit(1);
  }
})();
