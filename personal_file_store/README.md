# Amanat Cloud

Personal Telegram-backed cloud storage and study dashboard.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill your own values.

3. Run locally:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000/login.html
```

## MongoDB

When `MONGODB_URI` is set, the app uses MongoDB as the primary database for users, files, folders, notes, contacts, profile, OTPs, and sessions.

To move existing local JSON data into MongoDB:

```bash
npm run migrate:mongo
```

## Vercel Environment Variables

Add these in Vercel Project Settings:

```text
LOGIN_USERNAME
LOGIN_PASSWORD
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
MONGODB_URI
MONGODB_DB
STORAGE_LIMIT
```

For Vercel uploads, Telegram must be connected because serverless local file storage is not persistent.

## Safety

Never push `.env`, `data/*.json`, logs, `node_modules`, or uploaded private files to GitHub.
