#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <your-domain> <git-repo-url> [branch]"
  echo "Example: $0 example.com git@github.com:you/Call_bot.git main"
  exit 1
fi

DOMAIN="$1"
REPO="$2"
BRANCH="${3:-main}"

# Paths
APP_DIR="/var/www/call_bot"
BACKEND_DIR="$APP_DIR/Voice-call-backend"
FRONTEND_DIR="$APP_DIR/Voice-call-ui"
NGINX_SITE="/etc/nginx/sites-available/voicecall"

echo "Updating system and installing prerequisites..."
sudo apt update
sudo apt upgrade -y
sudo apt install -y git nginx certbot python3-certbot-nginx

echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

echo "Cloning repository into $APP_DIR..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already cloned, pulling latest"
  cd "$APP_DIR" && git fetch && git checkout "$BRANCH" && git pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

echo "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --production

echo "Create .env from .env.example and edit values as needed:"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  - Edit $BACKEND_DIR/.env and set ADMIN_USER, ADMIN_PASS, BASE_URL, and Plivo vars if used"
fi

echo "Starting backend with PM2..."
sudo npm install -g pm2
pm2 start npm --name voice-call-backend -- start --prefix "$BACKEND_DIR"
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"

echo "Building frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

echo "Copying frontend build to /var/www/voice-call-ui..."
sudo mkdir -p /var/www/voice-call-ui
sudo rm -rf /var/www/voice-call-ui/* || true
sudo cp -r dist/* /var/www/voice-call-ui/
sudo chown -R www-data:www-data /var/www/voice-call-ui

echo "Installing nginx site configuration..."
sudo tee "$NGINX_SITE" > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root /var/www/voice-call-ui;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
    }
}
NGINX

sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/voicecall
sudo nginx -t
sudo systemctl reload nginx

echo "Obtaining TLS certificate with Certbot..."
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m admin@$DOMAIN || true

echo "Deployment complete. Edit $BACKEND_DIR/.env before restarting if needed."
echo "To view backend logs: pm2 logs voice-call-backend"
