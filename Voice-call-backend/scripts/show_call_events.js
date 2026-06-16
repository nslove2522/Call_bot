const { allAsync } = require('../db');

(async () => {
  try {
    const rows = await allAsync(`SELECT id,recipient_id,plivo_call_uuid,event_type,timestamp,details FROM call_events ORDER BY id DESC LIMIT 50`);
    console.log('Recent call_events:');
    for (const r of rows) console.log(JSON.stringify(r));
  } catch (e) {
    console.error('Error reading call_events', e);
    process.exit(1);
  }
})();
