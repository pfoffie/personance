/**
 * Personance — OneSignal custom push notification provider (example / template)
 *
 * Setup steps
 * ───────────
 * 1. Create a Web Push app in the OneSignal dashboard
 *    (https://app.onesignal.com) and note your App ID and REST API Key.
 *
 * 2. Download OneSignalSDKWorker.js from the OneSignal dashboard and place it
 *    in the root of your site (same directory as sw.js).
 *    The file is already listed in .gitignore.
 *
 * 3. Copy this file to  custom/push.js  and fill in ONESIGNAL_APP_ID and
 *    PUSH_PHP_URL below.
 *
 * 4. Deploy custom.example.onesignal.php on your server (rename / move it as
 *    you like) and set PUSH_PHP_URL to its public URL.  Never put your REST
 *    API Key in a JS file — it belongs only in the PHP backend.
 *
 * The custom/ folder is gitignored, so credentials stay private.
 *
 * Reference: https://documentation.onesignal.com/docs/en/web-push-custom-code-setup
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Your OneSignal App ID (Dashboard → Settings → Keys & IDs) */
const ONESIGNAL_APP_ID = 'YOUR_ONESIGNAL_APP_ID';

/**
 * Public URL of your deployed PHP backend.
 * Example: 'https://yoursite.com/push/notify.php'
 */
const PUSH_PHP_URL = '/push/notify.php';

// ─── OneSignal SDK bootstrap ──────────────────────────────────────────────────

/** Resolves with the ready OneSignal instance; initialises the SDK on first call. */
let _sdkReady = null;

function _loadSDK() {
  if (_sdkReady) return _sdkReady;

  _sdkReady = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    // Inject the OneSignal SDK script tag if it is not already present.
    // For production, add an `integrity` (SRI hash) attribute matching the
    // exact SDK version you pin, and verify it against the OneSignal CDN file.
    if (!document.querySelector('script[src*="OneSignalSDK"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.crossOrigin = 'anonymous';
      script.defer = true;
      document.head.appendChild(script);
    }

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          // The service-worker file must sit in your site root.
          serviceWorkerPath: 'OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/' },
          // Allow testing on http://localhost during development.
          allowLocalhostAsSecureOrigin: true,
        });
        resolve(OneSignal);
      } catch (err) {
        reject(err);
      }
    });
  });

  return _sdkReady;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register this device with OneSignal and return its unique subscription ID.
 *
 * The subscription ID is stored by Personance (in localStorage under
 * 'personance-push-user-id') and passed back to scheduleNotification() so
 * the PHP backend can target exactly this device.
 *
 * @returns {Promise<string>} OneSignal push-subscription ID (UUID)
 */
export async function registerNotifications() {
  const OneSignal = await _loadSDK();

  // Ask the browser for notification permission (shows the native prompt).
  await OneSignal.Notifications.requestPermission();

  // Retrieve the subscription ID assigned by OneSignal to this device.
  const subscriptionId = OneSignal.User.PushSubscription.id;
  if (!subscriptionId) {
    throw new Error('OneSignal: permission was denied or subscription is unavailable');
  }

  return subscriptionId;
}

/**
 * Schedule a push notification via the PHP backend.
 *
 * The PHP backend forwards the request to the OneSignal REST API using
 * the secret REST API Key that must never appear in client-side code.
 *
 * @param {number} timestamp  Unix timestamp in ms when the notification should fire
 * @param {string} message    Notification body text (contact name)
 * @param {string} userId     Subscription ID returned by registerNotifications()
 * @returns {Promise<string>} OneSignal notification ID (used to cancel later)
 */
export async function scheduleNotification(timestamp, message, userId) {
  const res = await fetch(PUSH_PHP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp, message, userId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`push backend returned ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error('push backend did not return a notification ID');
  return data.id;
}

/**
 * Cancel a scheduled notification via the PHP backend.
 *
 * @param {string} messageId  OneSignal notification ID returned by scheduleNotification()
 * @returns {Promise<void>}
 */
export async function removeNotification(messageId) {
  const res = await fetch(
    `${PUSH_PHP_URL}?id=${encodeURIComponent(messageId)}`,
    { method: 'DELETE' }
  );

  // 404 means the notification was already sent or never existed — that is fine.
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`push backend returned ${res.status}: ${text}`);
  }
}
