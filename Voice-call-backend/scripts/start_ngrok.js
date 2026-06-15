const ngrok = require('ngrok');

(async () => {
  try {
    const token = process.argv[2] || process.env.NGROK_AUTHTOKEN;
    if (!token) {
      console.error('Usage: node start_ngrok.js <authtoken>');
      process.exit(1);
    }
    const url = await ngrok.connect({ authtoken: token, addr: 3001, bind_tls: true });
    console.log('ngrok url:', url);
    // keep process alive
    process.stdin.resume();
  } catch (e) {
    console.error('ngrok start error', e);
    process.exit(1);
  }
})();
