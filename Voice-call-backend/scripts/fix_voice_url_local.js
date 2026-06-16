require('dotenv').config();
const { runAsync, allAsync } = require('../db');
const path = require('path');

async function main() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const files = require('fs').readdirSync(uploadsDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!files.length) {
    console.error('no uploaded audio files found');
    process.exit(1);
  }
  const latest = files.sort().reverse()[0];
  const localUrl = (process.env.BASE_URL && process.env.BASE_URL.startsWith('http')) ? (process.env.BASE_URL.replace(/\/\/$/, '')) : 'http://localhost:3001';
  const voiceUrl = `${localUrl.replace(/https?:\/\//, 'http://localhost:3001/')}`;
  // ensure using localhost URL
  const finalUrl = `http://localhost:3001/uploads/${latest}`;
  console.log('Setting campaigns with ngrok-hosted voice_url to local URL:', finalUrl);
  await runAsync(`UPDATE campaigns SET voice_url = ? WHERE voice_url LIKE '%ngrok-free.dev%' OR voice_url LIKE '%localhost:%'`, [finalUrl]);
  const rows = await allAsync(`SELECT id, voice_url FROM campaigns ORDER BY id DESC LIMIT 5`);
  console.log(rows);
}

main().catch(err => { console.error(err); process.exit(1); });
