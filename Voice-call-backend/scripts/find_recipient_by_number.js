const { init, getAsync } = require('../db');

async function find(number) {
  await init();
  const row = await getAsync('SELECT * FROM recipients WHERE phone_number = ?', [number]);
  if (!row) {
    console.error(JSON.stringify({ found: false }));
    process.exit(2);
  }
  console.log(JSON.stringify({ found: true, recipient: row }));
}

const num = process.argv[2];
if (!num) {
  console.error('Usage: node find_recipient_by_number.js <phone_number>');
  process.exit(1);
}
find(num).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(3); });
