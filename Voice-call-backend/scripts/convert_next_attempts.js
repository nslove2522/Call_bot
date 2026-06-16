const fs = require('fs');
const path = require('path');
const { DB_FILE, allAsync, runAsync, getAsync } = require('../db');

async function backupDb() {
  const dir = path.dirname(DB_FILE);
  const base = path.basename(DB_FILE);
  const dest = path.join(dir, base + '.bak.' + Date.now());
  fs.copyFileSync(DB_FILE, dest);
  console.log('Created DB backup at', dest);
  return dest;
}

function parseIstStringToMs(ts) {
  // ts like 'YYYY-MM-DD HH:MM:SS' assumed to be IST (UTC+5:30)
  if (!ts) return null;
  if (/^\d+$/.test(String(ts))) return Number(ts);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(ts))) {
    const parts = String(ts).split(' ');
    const dateParts = parts[0].split('-').map(Number);
    const timeParts = parts[1].split(':').map(Number);
    const offsetMs = (5 * 60 + 30) * 60 * 1000;
    return Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]) - offsetMs;
  }
  const p = Date.parse(String(ts));
  if (!isNaN(p)) return p;
  return null;
}

async function convertNextAttempts() {
  console.log('Scanning recipients for next_attempt_at conversions...');
  const rows = await allAsync(`SELECT id, next_attempt_at FROM recipients WHERE next_attempt_at IS NOT NULL`);
  let converted = 0;
  for (const r of rows) {
    const val = r.next_attempt_at;
    if (!val) continue;
    if (/^\d+$/.test(String(val))) continue; // already numeric
    const ms = parseIstStringToMs(val);
    if (ms !== null) {
      await runAsync(`UPDATE recipients SET next_attempt_at = ? WHERE id = ?`, [String(ms), r.id]);
      converted++;
      console.log('Converted recipient', r.id, '->', ms);
    } else {
      console.log('Skipped (could not parse) recipient', r.id, val);
    }
  }
  console.log(`Conversion complete. Converted: ${converted}`);
  return converted;
}

async function pickAndSetTestRecipient() {
  // prefer an existing retry row, else pick a pending row
  let r = await getAsync(`SELECT id,phone_number,status FROM recipients WHERE status = 'retry' ORDER BY id LIMIT 1`);
  if (!r) r = await getAsync(`SELECT id,phone_number,status FROM recipients WHERE status = 'pending' ORDER BY id LIMIT 1`);
  if (!r) {
    console.log('No candidate recipient found to set for test');
    return null;
  }
  const immediateMs = Date.now() - 1000;
  await runAsync(`UPDATE recipients SET status = 'retry', next_attempt_at = ? WHERE id = ?`, [String(immediateMs), r.id]);
  console.log('Set recipient', r.id, 'phone', r.phone_number, 'to retry at', immediateMs);
  return r.id;
}

async function main() {
  try {
    console.log('DB file:', DB_FILE);
    const bak = await backupDb();
    const converted = await convertNextAttempts();
    const testId = await pickAndSetTestRecipient();
    console.log('Done. Backup:', bak, 'Converted:', converted, 'TestRecipientId:', testId);
  } catch (e) {
    console.error('Error in convert_next_attempts', e);
    process.exit(1);
  }
}

if (require.main === module) main();
