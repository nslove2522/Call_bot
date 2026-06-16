require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { runAsync, getAsync } = require('../db');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error('Download failed: ' + res.statusCode));
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (err) => {
      fs.unlinkSync(dest, { force: true });
      reject(err);
    });
  });
}

async function main() {
  const remote = process.argv[2] || 'https://res.cloudinary.com/dfq2uvp3p/video/upload/v1781609823/2wsayg_-_1_dsgayb.mp3';
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${Date.now()}-cloudinary.mp3`;
  const dest = path.join(uploadsDir, filename);
  console.log('Downloading', remote, '->', dest);
  try {
    await downloadFile(remote, dest);
    const baseUrl = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
    const voiceUrl = `${baseUrl}/uploads/${filename}`;
    console.log('Saved file, creating campaign and recipient in DB with voice_url:', voiceUrl);
    const r = await runAsync(`INSERT INTO campaigns (name, type, voice_url) VALUES (?,?,?)`, [`diagnostic-${Date.now()}`, 'voice', voiceUrl]);
    const campaignId = r.lastID;
    const rec = await runAsync(`INSERT INTO recipients (campaign_id, phone_number) VALUES (?,?)`, [campaignId, process.env.TEST_NUMBER || '+10000000000']);
    const recipientId = rec.lastID;
    console.log(JSON.stringify({ campaignId, recipientId, voiceUrl }, null, 2));
  } catch (err) {
    console.error('import error', err);
    process.exit(1);
  }
}

main();
