const fs = require('fs');
const path = require('path');
const { generateKeyPairSync } = require('crypto');

const outDir = path.join(__dirname, '..', '.github', 'keys');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const privatePath = path.join(outDir, 'deploy_key');
const publicPath = path.join(outDir, 'deploy_key.pub');
if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
  console.log('Key already exists. Delete existing files to regenerate.');
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.chmodSync(privatePath, 0o600);
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Generated keypair:');
console.log('  Private:', privatePath);
console.log('  Public :', publicPath);
console.log('\nNext steps:');
console.log(' 1) Add the public key contents to your server user ~/.ssh/authorized_keys');
console.log(' 2) Copy the private key contents into your GitHub repo secret DEPLOY_KEY');
console.log(' 3) Add other required secrets: SSH_HOST, SSH_USER, SSH_PORT, DOMAIN, REPO_URL, BRANCH');
