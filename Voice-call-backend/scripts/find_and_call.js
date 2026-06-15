const { allAsync, runAsync, getAsync, DB_FILE } = require('../db');
const fetch = require('node-fetch');

async function findByNumber(num) {
  // try exact match and variants
  const rows = await allAsync(`SELECT * FROM recipients WHERE phone_number = ? OR phone_number = ? OR phone_number = ?`, [num, '+'+num, num.replace(/^\+/, '')]);
  return rows;
}

async function main() {
  const num = process.argv[2];
  if (!num) return console.error('usage: node find_and_call.js <number>');
  console.log('DB file:', DB_FILE);
  const found = await findByNumber(num);
  console.log('found', found.length, 'rows');
  console.log(JSON.stringify(found, null, 2));
  if (found.length === 0) return console.log('No matching recipient.');
  const id = found[0].id;
  console.log('Triggering test call for recipient id', id);
  // use local backend
  const url = `http://localhost:3001/api/recipients/${id}/call`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('admin:admin').toString('base64') } });
  const body = await res.text();
  console.log('call response status', res.status, body);
}

main().catch(e=>{ console.error(e); process.exit(1) });
