const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_FILE } = require('../db');

function formatToISTFromISO(ts) {
  if (!ts) return '';
  try {
    const s = (typeof ts === 'string' && (ts.endsWith('Z') || ts.includes('T'))) ? ts : (ts + 'Z');
    const d = new Date(s);
    const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    const map = {};
    parts.forEach(p => { if (p.type && p.value) map[p.type] = p.value });
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  } catch (e) {
    return ts;
  }
}

function copyFileSync(src, dest) {
  fs.copyFileSync(src, dest);
}

async function run() {
  console.log('DB file:', DB_FILE);
  // backup
  const bakPath = DB_FILE + '.bak.' + Date.now();
  console.log('Creating DB backup:', bakPath);
  copyFileSync(DB_FILE, bakPath);

  const db = new sqlite3.Database(DB_FILE);
  const allAsync = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
  const runAsync = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err){ if (err) rej(err); else res(this); }));

  try {
    // recipients
    const recipients = await allAsync('SELECT id, last_attempt_at, next_attempt_at FROM recipients');
    console.log('Recipients to process:', recipients.length);
    for (const r of recipients) {
      const updates = {};
      if (r.last_attempt_at) updates.last_attempt_at = formatToISTFromISO(r.last_attempt_at);
      if (r.next_attempt_at) updates.next_attempt_at = formatToISTFromISO(r.next_attempt_at);
      if (Object.keys(updates).length) {
        await runAsync('UPDATE recipients SET last_attempt_at = ?, next_attempt_at = ? WHERE id = ?', [updates.last_attempt_at || null, updates.next_attempt_at || null, r.id]);
      }
    }

    // campaigns.created_at
    const campaigns = await allAsync('SELECT id, created_at FROM campaigns');
    console.log('Campaigns to process:', campaigns.length);
    for (const c of campaigns) {
      if (c.created_at) {
        const v = formatToISTFromISO(c.created_at);
        await runAsync('UPDATE campaigns SET created_at = ? WHERE id = ?', [v, c.id]);
      }
    }

    // call_events.timestamp
    const events = await allAsync('SELECT id, timestamp FROM call_events');
    console.log('Call events to process:', events.length);
    for (const ev of events) {
      if (ev.timestamp) {
        const v = formatToISTFromISO(ev.timestamp);
        await runAsync('UPDATE call_events SET timestamp = ? WHERE id = ?', [v, ev.id]);
      }
    }

    // update failed CSVs in uploads
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('failed_campaign_') && f.endsWith('.csv'));
      console.log('Failed CSVs to update:', files.length);
      for (const f of files) {
        const p = path.join(uploadsDir, f);
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split(/\r?\n/);
        if (lines.length <= 1) continue;
        const header = lines[0];
        const out = [header];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          // split into 5 parts: phone,status,attempts,last_attempt_at,rest (rest may contain commas)
          const m = line.match(/^([^,]+),([^,]+),([^,]+),([^,]*),(.*)$/s);
          if (!m) { out.push(line); continue; }
          const phone = m[1]; const status = m[2]; const attempts = m[3]; const last = m[4]; const rest = m[5];
          const newLast = last ? formatToISTFromISO(last) : '';
          out.push(`${phone},${status},${attempts},${newLast},${rest}`);
        }
        fs.writeFileSync(p, out.join('\n'), 'utf8');
        console.log('Updated CSV:', p);
      }
    }

    console.log('Backfill complete. Backup at', bakPath);
  } catch (e) {
    console.error('Backfill error', e);
    console.error('DB backup left at', bakPath);
  } finally {
    db.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
