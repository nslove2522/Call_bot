const fs = require('fs');
const path = require('path');
const scdl = require('soundcloud-downloader').default;

const url = 'https://soundcloud.com/sanjeevikumar-d/nirai';
const outDir = path.join(__dirname, 'Voice-call-backend', 'uploads');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const filename = `soundcloud-nirai-${Date.now()}.mp3`;
const outPath = path.join(outDir, filename);

(async () => {
  try {
    const stream = await scdl.download(url);
    const file = fs.createWriteStream(outPath);
    stream.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Saved to', outPath);
      console.log('Public URL: https://sharpie-vice-dawn.ngrok-free.dev/uploads/' + filename);
    });
    file.on('error', (err) => {
      console.error('Write error', err);
    });
  } catch (err) {
    console.error('Download error', err);
  }
})();