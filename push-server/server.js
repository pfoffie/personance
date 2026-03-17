/**
 * Personance — Push Notification Server
 *
 * Manages VAPID keys, push subscriptions, reminder schedules,
 * and delivers web push notifications for due reminders.
 *
 * Usage:
 *   npm install
 *   npm run generate-keys   # generate VAPID keys, copy output to .env
 *   npm start
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const PUSH_INTERVAL_MS = parseInt(process.env.PUSH_INTERVAL_MS || '60000', 10); // default 60 s

// Origins allowed to call the API (comma-separated). '*' to allow all.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error(
    'ERROR: VAPID keys are not set.\n' +
    'Run  npm run generate-keys  and copy the output into your .env file.'
  );
  process.exit(1);
}

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** Ensure the data directory exists. */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load subscriptions from disk.
 * Schema: { [endpoint]: { subscription: PushSubscription, reminders: Reminder[], updatedAt: string } }
 */
function loadSubscriptions() {
  ensureDataDir();
  try {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  } catch (err) {
    // File may be missing on first run or corrupted — start with empty state
    if (err.code !== 'ENOENT') {
      console.error('[store] Failed to load subscriptions:', err.message);
    }
    return {};
  }
}

/** Persist subscriptions to disk (sync, small file). */
function saveSubscriptions(data) {
  ensureDataDir();
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(cors({
  origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/vapid-public-key
 * Returns the server's VAPID public key so the client can subscribe.
 */
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /api/subscribe
 * Body: { subscription: PushSubscription, reminders?: Reminder[] }
 * Registers a push subscription and (optionally) an initial reminder list.
 */
app.post('/api/subscribe', (req, res) => {
  const { subscription, reminders } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription.endpoint' });
  }
  const data = loadSubscriptions();
  const existing = data[subscription.endpoint] || {};
  data[subscription.endpoint] = {
    subscription,
    reminders: Array.isArray(reminders) ? reminders : (existing.reminders || []),
    updatedAt: new Date().toISOString(),
  };
  saveSubscriptions(data);
  res.json({ ok: true });
});

/**
 * DELETE /api/unsubscribe
 * Body: { endpoint: string }
 * Removes the subscription and its reminders from the server.
 */
app.delete('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const data = loadSubscriptions();
  delete data[endpoint];
  saveSubscriptions(data);
  res.json({ ok: true });
});

/**
 * PUT /api/sync
 * Body: { endpoint: string, reminders: Reminder[] }
 * Updates the reminder list for an existing subscription.
 * A Reminder is: { id: string, name: string, reminderDate: string (ISO 8601) }
 */
app.put('/api/sync', (req, res) => {
  const { endpoint, reminders } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  if (!Array.isArray(reminders)) return res.status(400).json({ error: 'reminders must be an array' });
  const data = loadSubscriptions();
  if (!data[endpoint]) return res.status(404).json({ error: 'Subscription not found' });
  data[endpoint].reminders = reminders;
  data[endpoint].updatedAt = new Date().toISOString();
  saveSubscriptions(data);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Push delivery
// ---------------------------------------------------------------------------

/**
 * Send a push notification to a single subscription.
 * Removes the subscription from storage if the browser reports it as expired/gone.
 * @param {string} endpoint
 * @param {{ subscription, reminders, updatedAt }} record
 * @param {object} payload   - { title, body }
 * @returns {Promise<boolean>} true if sent, false if removed
 */
async function sendPush(endpoint, record, payload) {
  try {
    await webPush.sendNotification(record.subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription has expired or been unsubscribed by the browser — clean up.
      const data = loadSubscriptions();
      delete data[endpoint];
      saveSubscriptions(data);
      console.log(`[push] Removed expired subscription: ${_shortEndpoint(endpoint)}`);
    } else {
      console.error(`[push] Failed to send to ${_shortEndpoint(endpoint)}:`, err.message);
    }
    return false;
  }
}

/**
 * Check all stored reminders and send push notifications for any that are due.
 * A reminder is due when reminderDate <= now and has not been sent since reminderDate.
 */
async function checkAndSendDueReminders() {
  const data = loadSubscriptions();
  const now = new Date();
  let changed = false;

  for (const [endpoint, record] of Object.entries(data)) {
    if (!Array.isArray(record.reminders)) continue;
    for (const reminder of record.reminders) {
      if (!reminder.reminderDate) continue;
      const due = new Date(reminder.reminderDate);
      if (due > now) continue; // not yet due
      // Only send if we haven't already sent for this reminderDate
      if (reminder.lastNotified && new Date(reminder.lastNotified) >= due) continue;

      console.log(`[push] Sending reminder "${reminder.name}" to ${_shortEndpoint(endpoint)}`);
      const sent = await sendPush(endpoint, record, {
        title: '⏰ Personance',
        body: reminder.name,
        data: { reminderId: reminder.id },
      });
      if (sent) {
        reminder.lastNotified = now.toISOString();
        changed = true;
      }
    }
  }

  if (changed) saveSubscriptions(data);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function startScheduler() {
  console.log(`[scheduler] Checking for due reminders every ${PUSH_INTERVAL_MS / 1000}s`);
  // Run immediately on startup, then on interval
  checkAndSendDueReminders().catch(console.error);
  setInterval(() => checkAndSendDueReminders().catch(console.error), PUSH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _shortEndpoint(endpoint) {
  if (!endpoint || endpoint.length <= 40) return endpoint;
  return endpoint.slice(0, 20) + '…' + endpoint.slice(-12);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[server] Personance push server running on http://localhost:${PORT}`);
  console.log(`[server] VAPID public key: ${VAPID_PUBLIC_KEY.slice(0, 20)}…`);
  startScheduler();
});
