# Voice Call Backend

Minimal Node.js + Express backend scaffold for Plivo-based bulk SMS/voice campaigns using SQLite.

Quick start

1. Copy `.env.example` to `.env` and set values.
2. Install dependencies:

```bash
cd Voice-call-backend
npm install
```

3. Start server:

```bash
npm start
```

API highlights
- `POST /api/campaigns` - create campaign (protected by Basic auth header matching `ADMIN_USER`/`ADMIN_PASS`)
- `POST /api/campaigns/:id/recipients/upload` - upload CSV (form field `file`) or send JSON body `{ numbers: [] }`
- `POST /api/campaigns/:id/start` - start sending to pending recipients
- `POST /api/plivo/webhook` - Plivo webhook for call events (needs securing/validation)

Notes
- Uses SQLite (`DATABASE_FILE`) and creates schema on first run.
- Plivo SDK is used if `PLIVO_AUTH_ID` and `PLIVO_AUTH_TOKEN` are provided; otherwise sends are simulated.

Docker
------

Build and run with Docker (recommended for server deployment):

1. Build and start with docker-compose (will mount `./data` and `./uploads`):

```bash
cd Voice-call-backend
docker compose up --build -d
```

2. The backend will be available on port `3001` of the host. Environment variables are read from `.env` via `docker-compose.yml`.

3. To view logs:

```bash
docker compose logs -f backend
```

Notes:
- If you want to run the container without `docker-compose`, build with `docker build -t voice-backend .` and run with `docker run -p 3001:3001 --env-file .env -v $(pwd)/data:/usr/src/app/data -v $(pwd)/uploads:/usr/src/app/uploads voice-backend`.
- Ensure the `BASE_URL` in your `.env` points to a reachable HTTPS endpoint (ngrok/ngrok-authtoken or a public host) so Plivo can request `/api/plivo/answer`.

