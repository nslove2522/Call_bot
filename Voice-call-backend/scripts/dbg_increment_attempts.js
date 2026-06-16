const { init, getAsync, runAsync } = require('../db');

async function dbg(id) {
  await init();
  const before = await getAsync('SELECT attempts, last_attempt_at FROM recipients WHERE id = ?', [id]);
  console.log('before', before);
  const nowIst = new Date().toISOString();
  // format to IST-like string yyyy-mm-dd hh:MM:ss
  function fmtToIST(ts) {
    const d = new Date(ts);
    const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    const map = {};
    parts.forEach(p => { if (p.type && p.value) map[p.type] = p.value });
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  }
  await runAsync('UPDATE recipients SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ?', [fmtToIST(nowIst), id]);
  const after = await getAsync('SELECT attempts, last_attempt_at FROM recipients WHERE id = ?', [id]);
  console.log('after', after);
}

const id = process.argv[2]; if (!id) { console.error('id required'); process.exit(1); }
 dbg(id).catch(e => { console.error(e); process.exit(2); });
