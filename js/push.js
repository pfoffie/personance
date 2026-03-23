/**
 * Personance — Custom push notification provider wrapper
 *
 * Dynamically loads custom/push.js (gitignored) if present, and delegates
 * to the three functions defined there:
 *
 *   registerNotifications()                         → userId
 *   scheduleNotification(timestamp, message, userId) → messageId
 *   removeNotification(messageId)
 *
 * Copy custom.example.push.js to custom/push.js to implement your own
 * push notification backend.
 */
const PushProvider = (() => {
  const USER_ID_KEY = 'personance-push-user-id';

  /** null = not yet attempted; {} = loaded but not configured; module = configured */
  let _provider = null;
  let _configured = false;

  /** In-flight registration promise, so scheduleNotification() can await it. */
  let _registerPromise = null;

  // ─── Module loading ───────────────────────────────────────────────────────────

  async function _load() {
    if (_provider !== null) return;
    try {
      const mod = await import('../custom/push.js');
      _provider = mod;
      _configured = typeof mod.registerNotifications === 'function';
    } catch (_) {
      _provider = {};
      _configured = false;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Load the custom provider module. Call once at app startup.
   * @returns {Promise<boolean>}  true when custom/push.js is present and valid
   */
  async function init() {
    await _load();
    return _configured;
  }

  /** Returns true when custom/push.js is present and exports registerNotifications. */
  function isConfigured() {
    return _configured;
  }

  /**
   * Register this device with the push service.
   * Stores the returned userId in localStorage for reuse across sessions.
   * @returns {Promise<string|null>}
   */
  async function registerNotifications() {
    await _load();
    if (!_configured) return null;
    _registerPromise = (async () => {
      try {
        const userId = await _provider.registerNotifications();
        if (userId != null) localStorage.setItem(USER_ID_KEY, String(userId));
        return userId ?? null;
      } catch (_) {
        return null;
      }
    })();
    return _registerPromise;
  }

  /**
   * Schedule a push notification for a future timestamp.
   * Waits for any in-flight registerNotifications() call before proceeding.
   * @param {number} timestamp  Unix timestamp in ms (Date.getTime())
   * @param {string} message    Notification body text
   * @returns {Promise<string|null>}  Unique message ID for later removal, or null
   */
  async function scheduleNotification(timestamp, message) {
    await _load();
    if (!_configured) return null;
    // Wait for any in-progress registration so the userId is available.
    if (_registerPromise) await _registerPromise;
    const userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) return null;
    try {
      const id = await _provider.scheduleNotification(timestamp, message, userId);
      return id ?? null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Cancel a previously scheduled notification.
   * @param {string} messageId  ID returned by scheduleNotification()
   * @returns {Promise<void>}
   */
  async function removeNotification(messageId) {
    if (!messageId) return;
    await _load();
    if (!_configured || typeof _provider.removeNotification !== 'function') return;
    try {
      await _provider.removeNotification(messageId);
    } catch (_) {
      // ignore
    }
  }

  return { init, isConfigured, registerNotifications, scheduleNotification, removeNotification };
})();

export default PushProvider;
