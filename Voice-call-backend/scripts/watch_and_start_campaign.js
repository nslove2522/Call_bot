const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const CAMPAIGN_ID = process.env.AUTO_START_CAMPAIGN_ID || '21';
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

console.log('watch_and_start_campaign: watching', UPLOADS_DIR);

async function getCampaignStatus() {
  try {
    const res = await axios.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/status`);
    return res.data;
  } catch (err) {
    console.error('status check failed:', err.message);
    return null;
  }
}

async function startCampaign() {
  try {
    const res = await axios.post(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/start`, {}, {
      auth: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    console.log('start response:', res.data);
  } catch (err) {
    console.error('start failed:', err.message);
  }
}

let processing = false;

fs.watch(UPLOADS_DIR, async (eventType, filename) => {
  if (!filename) return;
  if (processing) return;
  processing = true;
  try {
    const filePath = path.join(UPLOADS_DIR, filename);
    // Wait briefly for file to be fully written
    await new Promise(r => setTimeout(r, 1500));
    if (!fs.existsSync(filePath)) {
      processing = false;
      return;
    }
    console.log('Detected upload file:', filename);

    // Poll campaign status for up to 30s until recipients appear
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const status = await getCampaignStatus();
      if (status && (status.pending || status.total)) {
        console.log('Campaign status:', status);
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    // Start campaign
    console.log('Attempting to start campaign', CAMPAIGN_ID);
    await startCampaign();
  } catch (err) {
    console.error('Watcher error:', err);
  } finally {
    processing = false;
  }
});

// keep process alive
setInterval(() => {}, 1 << 30);
