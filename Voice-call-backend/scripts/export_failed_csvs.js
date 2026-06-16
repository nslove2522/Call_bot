const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const EXPORT_DIR = path.join(__dirname, '..', 'exports');

if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const files = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith('failed_campaign_') && f.endsWith('.csv'));
if (files.length === 0) {
  console.log('No failed_campaign CSVs found in', UPLOADS_DIR);
  process.exit(0);
}

for (const f of files) {
  const src = path.join(UPLOADS_DIR, f);
  const dest = path.join(EXPORT_DIR, f);
  fs.copyFileSync(src, dest);
  console.log('Copied', src, '->', dest);
}

console.log('Export complete. Files:', files);
