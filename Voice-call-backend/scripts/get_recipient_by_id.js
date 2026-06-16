const { init, getAsync } = require('../db');

async function get(id) {
  await init();
  const row = await getAsync('SELECT * FROM recipients WHERE id = ?', [id]);
  if (!row) {
    console.error(JSON.stringify({ found: false }));
    process.exit(2);
  }
  console.log(JSON.stringify({ found: true, recipient: row }));
}

const id = process.argv[2];
if (!id) {
  console.error('Usage: node get_recipient_by_id.js <id>');
  process.exit(1);
}
get(id).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(3); });
