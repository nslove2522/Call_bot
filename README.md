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
