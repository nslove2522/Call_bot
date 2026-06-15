const { allAsync, getAsync, DB_FILE } = require('../db');

async function inspect() {
  console.log('DB file:', DB_FILE);
  try {
    const campaigns = await allAsync('SELECT * FROM campaigns');
    const recipients = await allAsync('SELECT * FROM recipients ORDER BY id DESC LIMIT 200');
    const events = await allAsync('SELECT * FROM call_events ORDER BY id DESC LIMIT 200');
    console.log(JSON.stringify({ campaigns, recipients, events }, null, 2));
  } catch (err) {
    console.error('inspect error', err);
    process.exit(1);
  }
}

inspect();
