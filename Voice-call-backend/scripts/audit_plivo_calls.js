const { allAsync } = require('../db');

function safeParseDetails(details) {
  try {
    return typeof details === 'string' ? JSON.parse(details) : details || {};
  } catch (e) { return {} }
}

(async () => {
  try {
    const rows = await allAsync(`SELECT id,recipient_id,plivo_call_uuid,event_type,timestamp,details FROM call_events ORDER BY id DESC`);
    const totals = { total: rows.length, byEvent: {}, byCallStatus: {}, byHangupCause: {} };
    for (const r of rows) {
      totals.byEvent[r.event_type] = (totals.byEvent[r.event_type] || 0) + 1;
      const d = safeParseDetails(r.details);
      const callStatus = d.CallStatus || d.call_status || d.event || r.event_type || 'unknown';
      const hangup = d.HangupCause || d.HangupCauseName || d.hangup_cause || 'unknown';
      totals.byCallStatus[callStatus] = (totals.byCallStatus[callStatus] || 0) + 1;
      totals.byHangupCause[hangup] = (totals.byHangupCause[hangup] || 0) + 1;
    }

    console.log('Plivo Call Events Audit');
    console.log('Total events:', totals.total);
    console.log('\nEvents by event_type:');
    Object.entries(totals.byEvent).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(k, v));
    console.log('\nEvents by CallStatus:');
    Object.entries(totals.byCallStatus).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(k, v));
    console.log('\nTop Hangup Causes:');
    Object.entries(totals.byHangupCause).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(k, v));

    console.log('\nRecent 10 events (id,recipient_id,CallStatus,HangupCause,timestamp,plivo_call_uuid):');
    for (let i=0;i<Math.min(10, rows.length); i++) {
      const r = rows[i];
      const d = safeParseDetails(r.details);
      const callStatus = d.CallStatus || d.call_status || d.event || r.event_type || 'unknown';
      const hangup = d.HangupCause || d.HangupCauseName || d.hangup_cause || '';
      console.log(r.id, r.recipient_id, callStatus, hangup, r.timestamp, r.plivo_call_uuid);
    }

    process.exit(0);
  } catch (e) {
    console.error('Audit failed', e);
    process.exit(1);
  }
})();
