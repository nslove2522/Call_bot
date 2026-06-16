const { allAsync } = require('../db');

(async () => {
  try {
    const rows = await allAsync(`SELECT id,phone_number,status,attempts,next_attempt_at,last_attempt_at,plivo_call_uuid FROM recipients WHERE id IN (100,101,102) ORDER BY id`);
    console.log('Recipients:');
    for (const r of rows) {
      console.log(JSON.stringify(r));
    }
  } catch (e) {
    console.error('Error verifying recipients', e);
    process.exit(1);
  }
})();
