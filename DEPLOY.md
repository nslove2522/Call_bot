# VPS deploy guide (no Docker)

This repository includes helper files and a script to deploy the app to an Ubuntu VPS (18.04/20.04/22.04+) without Docker.

Files added:
- `Voice-call-backend/.env.example` — copy to `.env` and edit values.
- `deploy/vps-deploy.sh` — server-side script to clone, install, build, and configure Nginx + Certbot.
- `deploy/voicecall.nginx.conf` — template of the Nginx site used by the script.

Quick summary
1. Provision an Ubuntu server and point your domain DNS to its IP.
2. SSH in and run the deploy script (example below).
3. Edit `Voice-call-backend/.env` on the server and restart the backend if necessary.

Example usage (run on the VPS as the deploying user):

```bash
# on your server
sudo bash /path/to/repo/deploy/vps-deploy.sh example.com git@github.com:you/Call_bot.git main
```

Important env vars (set `Voice-call-backend/.env`):
- `ADMIN_USER`, `ADMIN_PASS` — basic auth for admin API/UI.
- `BASE_URL` — public HTTPS URL (e.g. `https://example.com`) used for Plivo callbacks.
- `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_SOURCE_NUMBER` — optional; if omitted, calls are simulated.

Notes and caveats
- The app uses SQLite by default (`data/db.sqlite`). On a VPS this file will persist in the repo path. For horizontal scaling or resilient backups move to a managed DB and update `DATABASE_FILE`.
- The deploy script installs Node 20 and PM2 globally, and places the frontend build to `/var/www/voice-call-ui` served by Nginx.
- Certbot is used to obtain TLS certificates. Ensure your domain DNS is pointed and reachable.

Post-deploy commands

```bash
# Restart backend
pm2 restart voice-call-backend

# View logs
pm2 logs voice-call-backend

# Nginx status
sudo systemctl status nginx
```

Generate and install deploy key (recommended)

1. On your local machine (in the repo root), run the helper script to generate an SSH keypair:

```bash
bash scripts/generate_deploy_key.sh
```

2. Add the generated public key `.github/keys/deploy_key.pub` to your server user's `~/.ssh/authorized_keys`.

3. Copy the private key `.github/keys/deploy_key` contents and add it as the GitHub repository secret `DEPLOY_KEY`.

4. Ensure the other GitHub secrets are set: `SSH_HOST`, `SSH_USER`, `SSH_PORT` (optional), `DOMAIN`, `REPO_URL`, `BRANCH`.

5. Trigger the workflow by pushing to `main` or via the Actions tab.

