/**
 * Personance — Notification abstraction layer
 * Currently supports in-app visual alerts.
 * Designed to be extended with Web Push API / APNs in future versions.
 */
const Notifications = (() => {
  let _enabled = false;
  let _permission = 'default'; // 'default' | 'granted' | 'denied'

  /** Initialize and check browser capabilities */
  function init() {
    if ('Notification' in window) {
      _permission = Notification.permission;
    }
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
    // Try native notification
    if (_enabled && _permission === 'granted' && 'Notification' in window) {
      try {
        const n = new Notification(title, { body, icon: 'icons/icon-192.svg', ...options });
        n.onclick = () => {
          window.focus();
          n.close();
          if (options.onClick) options.onClick();
        };
        return;
      } catch (_) {
        // SW-based notification needed on mobile — fall through to in-app
      }
    }
    // In-app fallback
    _showInApp(title, body);
  }

  /**
   * Register for push notifications (future).
   * Placeholder — will integrate with push service subscription.
   */
  async function registerPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null;
    }
    const reg = await navigator.serviceWorker.ready;
    // Future: reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ... })
    return reg;
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

  return { init, requestPermission, isSupported, getPermission, setEnabled, isEnabled, notify, registerPush };
})();

export default Notifications;
