/**
 * Personance — ntfy.sh push notification provider
 *
 * Uses ntfy.sh (https://ntfy.sh) as a free, serverless Web Push delivery
 * service. Each device gets a unique randomly-generated topic. The app
 * schedules delayed messages when reminders are saved; ntfy.sh holds them
 * and delivers them as Web Push notifications — even when the app is closed.
 *
 * Provider evaluation summary
 * ----------------------------
 * Several free push services were evaluated:
 *
 * | Provider      | Free tier        | Server needed? | Scheduled msgs | Notes                          |
 * |---------------|------------------|----------------|----------------|--------------------------------|
 * | ntfy.sh       | Unlimited msgs   | No             | Yes (At: hdr)  | Open-source, self-hostable     |
 * | OneSignal     | Unlimited subs   | Partial        | No (free tier) | Dashboard-driven               |
 * | Firebase/FCM  | Generous limits  | Yes            | No             | Needs Cloud Functions          |
 * | Pushover      | 10k msgs/month   | No             | No             | One-time $5 client fee         |
 *
 * ntfy.sh wins because:
 *  - Completely free for self-hosted or via ntfy.sh cloud
 *  - Supports scheduled/delayed messages (the `At:` header)
 *  - Has a native Web Push endpoint (no custom server needed)
 *  - Simple REST API usable directly from the browser
 *  - Open-source and privacy-respecting
 *
 * Architecture
 * ------------
 * 1. On first enable: generate a random private topic name, fetch the
 *    ntfy.sh VAPID public key, subscribe the browser to Web Push, and
 *    register the subscription with ntfy.sh for the topic.
 * 2. When a contact reminder is saved: POST a delayed message to ntfy.sh
 *    using the `At: <unix-timestamp>` header.
 * 3. At the scheduled time ntfy.sh delivers a Web Push to the browser.
 * 4. The service worker (sw.js) receives the push and shows the notification.
 */
const NtfyProvider = (() => {
  const NTFY_BASE = 'https://ntfy.sh';
  const TOPIC_KEY = 'personance-ntfy-topic';

  // ─── VAPID key ──────────────────────────────────────────────────────────────

  /**
   * Fetch ntfy.sh's VAPID public key by loading their server config.
   * Returns null if unreachable or the key cannot be found.
   * @returns {Promise<string|null>}
   */
  async function fetchVapidKey() {
    try {
      const resp = await fetch(`${NTFY_BASE}/config.js`);
      if (!resp.ok) return null;
      const text = await resp.text();
      const match = text.match(/web_push_public_key:\s*["']([A-Za-z0-9+/=_-]+)["']/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  // ─── Topic management ────────────────────────────────────────────────────────

  /**
   * Return the stored topic, creating one if it does not exist yet.
   * Topic format: personance-<20 lowercase hex chars>
   * @returns {string}
   */
  function getOrCreateTopic() {
    let topic = localStorage.getItem(TOPIC_KEY);
    if (!topic) {
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      topic = `personance-${hex}`;
      localStorage.setItem(TOPIC_KEY, topic);
    }
    return topic;
  }

  /** @returns {string|null} */
  function getTopic() {
    return localStorage.getItem(TOPIC_KEY);
  }

  function clearTopic() {
    localStorage.removeItem(TOPIC_KEY);
  }

  // ─── Subscription registration ───────────────────────────────────────────────

  /**
   * Tell ntfy.sh to deliver messages for `topic` to this browser via Web Push.
   * Must be called after obtaining a PushSubscription from the browser.
   *
   * @param {PushSubscription|object} subscription  browser push subscription
   * @param {string} topic  the ntfy.sh topic to subscribe to
   * @returns {Promise<boolean>}
   */
  async function registerSubscription(subscription, topic) {
    try {
      // JSON.stringify(PushSubscription) gives { endpoint, keys: { auth, p256dh } }
      const sub = JSON.parse(JSON.stringify(subscription));
      const resp = await fetch(`${NTFY_BASE}/v1/webpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          auth: sub.keys.auth,
          p256dh: sub.keys.p256dh,
          topics: [topic],
        }),
      });
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Remove this browser's push subscription from ntfy.sh.
   *
   * @param {PushSubscription|object} subscription
   * @returns {Promise<boolean>}
   */
  async function unregisterSubscription(subscription) {
    try {
      const sub = subscription && typeof subscription.toJSON === 'function'
        ? subscription.toJSON()
        : subscription;
      if (!sub || !sub.endpoint) return false;
      const resp = await fetch(`${NTFY_BASE}/v1/webpush`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  // ─── Notification scheduling ─────────────────────────────────────────────────

  /**
   * Schedule a push notification to be delivered at a future time via ntfy.sh.
   *
   * ntfy.sh holds the message and publishes it to all subscribed browsers at
   * `deliverAt`.  The push arrives in sw.js as:
   *   { event: "message", subscription_id: "…", message: { title, message, … } }
   *
   * @param {string} topic      ntfy.sh topic to publish to
   * @param {string} title      notification title
   * @param {string} body       notification body
   * @param {Date}   deliverAt  when to deliver (must be in the future)
   * @returns {Promise<string|null>}  ntfy.sh message ID, or null on failure
   */
  async function scheduleNotification(topic, title, body, deliverAt) {
    try {
      const headers = {
        'Title': title,
        'Content-Type': 'text/plain; charset=utf-8',
      };
      if (deliverAt instanceof Date && deliverAt > new Date()) {
        // ntfy.sh accepts Unix timestamps (seconds) in the At header
        headers['At'] = String(Math.floor(deliverAt.getTime() / 1000));
      }
      const resp = await fetch(`${NTFY_BASE}/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers,
        body,
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json.id || null;
    } catch (_) {
      return null;
    }
  }

  return {
    fetchVapidKey,
    getOrCreateTopic,
    getTopic,
    clearTopic,
    registerSubscription,
    unregisterSubscription,
    scheduleNotification,
  };
})();

export default NtfyProvider;
