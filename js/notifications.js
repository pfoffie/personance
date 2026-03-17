/**
 * Personance — Notification abstraction layer
 * Handles in-app, native, and Web Push notifications.
 */
const Notifications = (() => {
  const SUBSCRIPTION_STORAGE_KEY = 'personance-push-subscription';
  let _enabled = false;
  let _permission = 'default'; // 'default' | 'granted' | 'denied'
  let _subscription = null;

  /** Initialize and check browser capabilities */
  function init() {
    if ('Notification' in window) {
      _permission = Notification.permission;
    }
    _subscription = _loadStoredSubscription();
  }

  /** Request permission for native notifications */
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    _permission = result;
    return result;
  }

  function isSupported() {
    return 'Notification' in window;
  }

  function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function getPermission() {
    return _permission;
  }

  function setEnabled(val) {
    _enabled = !!val;
  }

  function isEnabled() {
    return _enabled;
  }

  /**
   * Send a notification. Falls back to in-app if native not available.
   * @param {string} title
   * @param {string} body
   * @param {object} [options] - Extra options (icon, tag, data…)
   */
  function notify(title, body, options = {}) {
    const payload = { body, icon: 'assets/icons/icon_192.png', badge: 'assets/icons/icon_192.png', ...options };

    if (_enabled && _permission === 'granted') {
      if (isPushSupported()) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, payload))
          .catch(() => _showNativeOrFallback(title, body, payload, options));
        return;
      }
      if ('Notification' in window) {
        _showNativeOrFallback(title, body, payload, options);
        return;
      }
    }

    _showInApp(title, body);
  }

  /**
   * Register for push notifications and return the subscription.
   */
  async function registerPush({ applicationServerKey } = {}) {
    if (!isPushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      _subscription = existing;
      _persistSubscription(existing);
      return existing;
    }
    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey ? _toUint8Array(applicationServerKey) : undefined,
      });
      _subscription = sub;
      _persistSubscription(sub);
      return sub;
    } catch (_) {
      return null;
    }
  }

  async function disablePush() {
    if (!isPushSupported()) {
      _subscription = null;
      _persistSubscription(null);
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch (_) {
        // ignore
      }
    }
    _subscription = null;
    _persistSubscription(null);
    return true;
  }

  async function enablePush({ applicationServerKey, requestPermissionFirst = true } = {}) {
    if (!isPushSupported()) return { enabled: false, permission: 'unsupported', subscription: null };
    if (requestPermissionFirst && _permission === 'default') {
      const perm = await requestPermission();
      if (perm !== 'granted') return { enabled: false, permission: perm, subscription: null };
    }
    if (_permission !== 'granted') return { enabled: false, permission: _permission, subscription: null };
    _enabled = true;
    const sub = await registerPush({ applicationServerKey });
    return { enabled: _enabled, permission: _permission, subscription: sub ? sub.toJSON() : null };
  }

  async function restorePush({ applicationServerKey } = {}) {
    if (!isPushSupported()) return { enabled: false, permission: _permission, subscription: null };
    if (_permission !== 'granted') return { enabled: false, permission: _permission, subscription: null };
    _enabled = true;
    const sub = await registerPush({ applicationServerKey });
    return { enabled: _enabled, permission: _permission, subscription: sub ? sub.toJSON() : null };
  }

  /** Simple in-app toast notification */
  function _showInApp(title, body) {
    const el = document.createElement('div');
    el.className = 'in-app-notification';
    el.innerHTML = `<strong>${_esc(title)}</strong><span>${_esc(body)}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 400);
    }, 4000);
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function _showNativeOrFallback(title, body, payload, options) {
    try {
      const n = new Notification(title, payload);
      n.onclick = () => {
        window.focus();
        n.close();
        if (options.onClick) options.onClick();
      };
    } catch (_) {
      _showInApp(title, body);
    }
  }

  function _persistSubscription(sub) {
    try {
      if (!sub) {
        localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
        return;
      }
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(sub.toJSON()));
    } catch (_) {
      // ignore
    }
  }

  function _loadStoredSubscription() {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getSubscription() {
    return _subscription || _loadStoredSubscription();
  }

  function getSupportState() {
    return {
      permission: _permission,
      enabled: _enabled,
      pushSupported: isPushSupported(),
      subscription: getSubscription(),
    };
  }

  function _toUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ---------------------------------------------------------------------------
  // Push server integration
  // ---------------------------------------------------------------------------

  /**
   * Fetch the VAPID public key from the push server.
   * @param {string} serverUrl - Base URL of the push server
   * @returns {Promise<string|null>}
   */
  async function fetchVapidKey(serverUrl) {
    if (!serverUrl) return null;
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/vapid-public-key`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.publicKey || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Register a push subscription with the server and optionally sync reminders.
   * @param {string} serverUrl
   * @param {object} subscription - JSON subscription (from PushSubscription.toJSON())
   * @param {Array<{id,name,reminderDate}>} [reminders]
   * @returns {Promise<boolean>}
   */
  async function registerWithServer(serverUrl, subscription, reminders) {
    if (!serverUrl || !subscription) return false;
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, reminders: reminders || [] }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Remove a push subscription from the server.
   * @param {string} serverUrl
   * @param {string} endpoint
   * @returns {Promise<boolean>}
   */
  async function unregisterFromServer(serverUrl, endpoint) {
    if (!serverUrl || !endpoint) return false;
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/unsubscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Sync the reminder list for an existing subscription.
   * @param {string} serverUrl
   * @param {string} endpoint
   * @param {Array<{id,name,reminderDate}>} reminders
   * @returns {Promise<boolean>}
   */
  async function syncRemindersWithServer(serverUrl, endpoint, reminders) {
    if (!serverUrl || !endpoint) return false;
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, reminders }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  return {
    init,
    requestPermission,
    isSupported,
    isPushSupported,
    getPermission,
    setEnabled,
    isEnabled,
    notify,
    registerPush,
    enablePush,
    restorePush,
    disablePush,
    getSubscription,
    getSupportState,
    fetchVapidKey,
    registerWithServer,
    unregisterFromServer,
    syncRemindersWithServer,
  };
})();

export default Notifications;
