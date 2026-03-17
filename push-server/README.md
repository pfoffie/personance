# Personance Push Server

A lightweight Node.js server that delivers real Web Push notifications for [Personance](../).

The server:
- Manages VAPID keys for authenticated push delivery
- Stores push subscriptions sent by the Personance PWA
- Syncs reminder schedules from clients
- Checks every minute for due reminders and sends push notifications via the [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)

## Requirements

- Node.js ≥ 18

## Setup

### 1. Install dependencies

```bash
cd push-server
npm install
```

### 2. Generate VAPID keys

```bash
npm run generate-keys
```

Copy the two lines of output into a `.env` file (see below).

### 3. Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in the VAPID keys generated in step 2:

```env
VAPID_PUBLIC_KEY=<your generated public key>
VAPID_PRIVATE_KEY=<your generated private key>
VAPID_SUBJECT=mailto:you@example.com
PORT=3000
ALLOWED_ORIGINS=https://yourapp.example.com
```

### 4. Start the server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vapid-public-key` | Returns the VAPID public key |
| `POST` | `/api/subscribe` | Register a push subscription (+ optional reminders) |
| `DELETE` | `/api/unsubscribe` | Remove a subscription |
| `PUT` | `/api/sync` | Update the reminder list for a subscription |

### POST `/api/subscribe`

```json
{
  "subscription": { "endpoint": "...", "keys": { "auth": "...", "p256dh": "..." } },
  "reminders": [
    { "id": "abc123", "name": "Call mom", "reminderDate": "2025-06-01T10:00:00.000Z" }
  ]
}
```

### DELETE `/api/unsubscribe`

```json
{ "endpoint": "https://push-service/..." }
```

### PUT `/api/sync`

```json
{
  "endpoint": "https://push-service/...",
  "reminders": [
    { "id": "abc123", "name": "Call mom", "reminderDate": "2025-06-01T10:00:00.000Z" }
  ]
}
```

## Connecting the PWA

1. Deploy the push server and note its URL (e.g. `https://push.yourapp.example.com`).
2. Open Personance → Settings and paste the server URL into the **Push server URL** field.
3. Enable notifications — the app will fetch the VAPID public key from the server, subscribe, and sync all reminders automatically.

## Data Storage

Subscriptions and reminder schedules are stored as JSON in the `data/` directory (gitignored). For production you may replace the file-based storage with a database of your choice.

## Security Notes

- Set `ALLOWED_ORIGINS` to your app's origin in production (do not use `*`).
- Keep the `VAPID_PRIVATE_KEY` secret and never commit it.
- The push server only stores reminder names and dates — no personal contact details.
