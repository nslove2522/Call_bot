const { runAsync } = require('../db');

(async () => {
  try {
    const voiceUrl = process.argv[2] || 'https://samplelib.com/mp3/sample-6s.mp3';
    const campaignId = parseInt(process.argv[3] || '3', 10);
    await runAsync(`UPDATE campaigns SET voice_url = ? WHERE id = ?`, [voiceUrl, campaignId]);
    console.log('updated campaign', campaignId, 'voice_url ->', voiceUrl);
  } catch (e) {
    console.error('error updating campaign', e);
    process.exit(1);
  }
})();
