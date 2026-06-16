const { init, allAsync } = require('../db');

async function find() {
  await init();
  const rows = await allAsync("SELECT * FROM recipients WHERE status = 'pending' ORDER BY id LIMIT 1");
  if (!rows || rows.length === 0) {
    console.error(JSON.stringify({ found: false }));
    process.exit(2);
  }
  console.log(JSON.stringify({ found: true, recipient: rows[0] }));
}

find().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(3); });
