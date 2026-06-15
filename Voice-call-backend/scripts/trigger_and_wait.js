const fetch = require('node-fetch');
const { allAsync } = require('../db');

const API = 'http://localhost:3001';
const AUTH = 'admin:admin';

(async () => {
  try {
    const resp = await fetch(`${API}/api/recipients/2/call`, { method: 'POST', headers: { 'authorization': 'Basic ' + Buffer.from(AUTH).toString('base64') } });
    const json = await resp.json();
    console.log('queued:', json.result && json.result.requestUuid);
    const uuid = json.result && (json.result.requestUuid || json.result.request_uuid);
    if (!uuid) return;
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const events = await allAsync(`SELECT * FROM call_events WHERE plivo_call_uuid = ?`, [uuid]);
      if (events && events.length) {
        console.log('events:', events);
        process.exit(0);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    console.log('no events seen for', uuid);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
