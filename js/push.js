/**
 * Personance — OneSignal push notification provider
 *
 * Requires a free OneSignal account (https://onesignal.com).
 * Fill in push-config.js with your App ID and REST API Key.
 *
 * Flow
 * ----
 * 1. Call initSDK() once at app startup. It initialises the OneSignal SDK
 *    without requesting permission or creating a subscription.
 * 2. Call subscribe() when the user enables notifications. OneSignal prompts
 *    for permission and creates a push subscription.
 * 3. Call scheduleNotification() when a reminder is saved. If a REST API Key
 *    is configured the notification is delivered at the future date even when
 *    the browser is closed; otherwise it is skipped (the in-app polling
 *    in _checkDueContacts still fires while the browser is open).
 * 4. Call unsubscribe() when the user disables notifications.
 */
const PushProvider = (() => {
  let _initialized = false;

  // ─── Config helpers ──────────────────────────────────────────────────────────

  function _cfg() {
    return window.PUSH_CONFIG || {};
  }

  function _oneSignalCfg() {
    const cfg = _cfg();
    return cfg.oneSignal || cfg;
  }

  function _appId() {
    const cfg = _oneSignalCfg();
    return cfg.appId || '';
  }

  /** Returns true when an App ID has been set in push-config.js. */
  function isConfigured() {
    return !!_appId();
  }

  /** Convenience accessor for the OneSignal global. */
  function _os() {
    return window.OneSignal || null;
  }

  // ─── SDK lifecycle ───────────────────────────────────────────────────────────

  /**
   * Initialise the OneSignal SDK.  Must be called once at app startup.
   * Does not request permission or create a subscription.
   * @returns {Promise<boolean>}
   */
  async function initSDK() {
    if (!isConfigured()) return false;
    const os = _os();
    if (!os) return false;
    if (_initialized) return true;
    const ready = await new Promise((resolve) => {
      let checks = 0;
      const tick = () => {
        if (os.User && os.User.PushSubscription) {
          resolve(true);
          return;
        }
        checks += 1;
        if (checks > 30) {
          resolve(false);
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
    _initialized = ready;
    return ready;
  }

  // ─── Subscription management ─────────────────────────────────────────────────

  /**
   * Opt the browser in to push notifications.
   * OneSignal will prompt for permission if it has not been granted yet.
   * @returns {Promise<boolean>}  true if successfully subscribed
   */
  async function subscribe() {
    if (!_initialized) return false;
    const os = _os();
    if (!os) return false;
    try {
      await os.User.PushSubscription.optIn();
      return !!os.User.PushSubscription.optedIn;
    } catch (_) {
      return false;
    }
  }

  /**
   * Opt the browser out of push notifications.
   * @returns {Promise<void>}
   */
  async function unsubscribe() {
    if (!_initialized) return;
    const os = _os();
    if (!os) return;
    try {
      await os.User.PushSubscription.optOut();
    } catch (_) {
      // ignore
    }
  }

  /**
   * Returns true when the browser is currently subscribed to push.
   * @returns {boolean}
   */
  function isSubscribed() {
    if (!_initialized) return false;
    const os = _os();
    return !!(os && os.User.PushSubscription.optedIn);
  }

  // ─── Notification scheduling ─────────────────────────────────────────────────

  /**
   * Schedule a push notification for a future date via the OneSignal REST API.
   *
   * Requires restApiKey in push-config.js.  Without it this is a no-op (the
   * in-app polling in _checkDueContacts still fires when the browser is open).
   *
   * @param {string} title
   * @param {string} body
   * @param {Date}   deliverAt  must be in the future
   * @returns {Promise<string|null>}  OneSignal notification id or null
   */
  async function scheduleNotification(title, body, deliverAt) {
    if (!_initialized || !isConfigured()) return null;
    const cfg = _cfg();
    if (!cfg.restApiKey) return null;
    const os = _os();
    if (!os) return null;

    const subscriptionId = os.User.PushSubscription.id;
    if (!subscriptionId) return null;

    const payload = {
      app_id: _appId(),
      include_subscription_ids: [subscriptionId],
      headings: { en: title },
      contents: { en: body },
    };

    if (deliverAt instanceof Date && deliverAt > new Date()) {
      // OneSignal accepts ISO 8601 for send_after.
      payload.send_after = deliverAt.toISOString();
    }

    try {
      const resp = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${cfg.restApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json.id || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Cancel a previously scheduled push notification via the OneSignal REST API.
   *
   * Requires restApiKey in push-config.js.  Without it this is a no-op.
   *
   * @param {string} notificationId  OneSignal notification id returned by scheduleNotification
   * @returns {Promise<void>}
   */
  async function cancelNotification(notificationId) {
    if (!notificationId) return;
    const cfg = _cfg();
    if (!cfg.restApiKey) return;
    try {
      await fetch(
        `https://onesignal.com/api/v1/notifications/${encodeURIComponent(notificationId)}?app_id=${encodeURIComponent(_appId())}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${cfg.restApiKey}`,
          },
        }
      );
    } catch (_) {
      // ignore
    }
  }

  return { isConfigured, initSDK, subscribe, unsubscribe, isSubscribed, scheduleNotification, cancelNotification };
})();

export default PushProvider;
