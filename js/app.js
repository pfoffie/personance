/**
 * Personance — Main App Controller
 * Handles routing between views, data flow, and lifecycle.
 */
import Store from './store.js';
import I18n from './i18n.js';
import Scheduler from './scheduler.js';
import Notifications from './notifications.js';
import NtfyProvider from './ntfy.js';
import ContactListView from './views/contactList.js';
import ContactEditorView from './views/contactEditor.js';
import SettingsView from './views/settings.js';
import IntroView from './views/intro.js';

const APP_VERSION = '1.2.4';
const VERSION_STORAGE_KEY = 'personance-installed-version';

const App = (() => {
  let _root = null;
  let _settings = null;
  let _contacts = [];
  let _checkInterval = null;
  let _unbindView = null;
  let _updateAvailable = false;
  let _waitingSW = null;
  let _pendingSWVersion = null;
  let _swRegistration = null;
  let _swListenersBound = false;
  let _installPrompt = null;
  let _installAvailable = false;
  let _notificationState = { permission: 'default', pushSupported: false, enabled: false, subscription: null };

  async function init() {
    _root = document.getElementById('app');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _installPrompt = e;
      _installAvailable = true;
      if (_root && _root.querySelector('.settings')) {
        _showSettings();
      }
    });
    _installAvailable = !_isStandalone();

    // Open database
    await Store.open();

    // Load settings & determine language
    _settings = await Store.getSettings();
    const hadValidSavedLanguage = ['en', 'de'].includes(_settings.language);
    const browserLang = (navigator.language || 'en').toLowerCase().substring(0, 2);
    const supportedLangs = ['en', 'de'];
    const preferredBrowserLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
    const lang = supportedLangs.includes(_settings.language) ? _settings.language : preferredBrowserLang;
    _settings.language = lang;
    await I18n.load(lang);
    if (!hadValidSavedLanguage) {
      await Store.saveSettings(_settings);
    }

    // Init notifications
    Notifications.init();
    Notifications.setEnabled(_settings.notificationsEnabled);
    await _bootstrapNotifications();

    // Load contacts
    _contacts = await Store.getAllContacts();

    // Show intro on first launch, otherwise main list
    const hasSeenIntro = localStorage.getItem('personance-intro-seen');
    if (!hasSeenIntro) {
      _showIntro(false);
    } else {
      _showList();
    }

    // Periodically check for due contacts (every 60s)
    _checkInterval = setInterval(_checkDueContacts, 60000);
    _checkDueContacts();

    // Register service worker
    _trackInstalledVersion(APP_VERSION);
    _registerSW();
  }

  // --- Views ---

  function _showIntro(showBack) {
    _clearViewBindings();
    _root.innerHTML = IntroView.render({ showBack, version: APP_VERSION });
    _unbindView = IntroView.bind(_root, {
      onStart: () => {
        localStorage.setItem('personance-intro-seen', '1');
        _showList();
      },
      onBack: () => _showList(),
    });
  }

  function _showList() {
    _clearViewBindings();
    _root.innerHTML = ContactListView.render(_contacts, _settings);
    _root.classList.add('view-enter');
    _unbindView = ContactListView.bind(_root, {
      onEdit: (id) => _showEditor(id),
      onRelease: (id) => _releaseContact(id),
      onAdd: () => _showEditor(null),
      onSettings: () => _showSettings(),
      onInfo: () => _showIntro(true),
    });
  }

  async function _showEditor(id) {
    _clearViewBindings();
    const contact = id ? await Store.getContact(id) : null;
    _root.innerHTML = ContactEditorView.render(contact, _settings);
    _unbindView = ContactEditorView.bind(_root, {
      contact,
      settings: _settings,
      onSave: (data) => _saveContact(id, data),
      onDelete: (cid, name) => _confirmDelete(cid, name),
      onBack: () => _showList(),
    });
  }

  async function _showSettings() {
    _clearViewBindings();
    const notificationState = {
      ...Notifications.getSupportState(),
      ntfyTopic: NtfyProvider.getTopic(),
    };
    _root.innerHTML = SettingsView.render(_settings, {
      updateAvailable: _updateAvailable,
      notificationState,
      installAvailable: _installAvailable && !_isStandalone(),
    });
    _unbindView = SettingsView.bind(_root, {
      settings: _settings,
      notificationState,
      onToggleNotifications: (val) => _toggleNotifications(val),
      onInstall: () => _promptInstall(),
      onSave: (data, langChanged) => _saveSettings(data, langChanged),
      onApplyUpdate: () => _applyUpdate(),
      onCheckUpdate: () => _checkForUpdates(),
      onBack: () => _showList(),
    });
  }

  // --- Actions ---

  async function _saveContact(existingId, data) {
    let contact;
    if (existingId) {
      contact = await Store.getContact(existingId);
      contact.name = data.name;
      contact.distance = data.distance;
      contact.uncertainty = data.uncertainty;
      // Recompute reminder only if distance/uncertainty changed
      contact.reminderDate = Scheduler.computeNextReminder(
        data.distance, data.uncertainty,
        _settings.availableDays, _settings.availableHours
      ).toISOString();
    } else {
      contact = {
        id: _generateId(),
        name: data.name,
        distance: data.distance,
        uncertainty: data.uncertainty,
        reminderDate: Scheduler.computeNextReminder(
          data.distance, data.uncertainty,
          _settings.availableDays, _settings.availableHours
        ).toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
    contact.updatedAt = new Date().toISOString();
    await Store.saveContact(contact);
    _contacts = await Store.getAllContacts();
    // Schedule a real push notification via ntfy.sh for the new reminder date
    _schedulePushForContact(contact);
    _showList();
  }

  async function _releaseContact(id) {
    const contact = await Store.getContact(id);
    if (!contact) return;
    // Reschedule
    contact.reminderDate = Scheduler.computeNextReminder(
      contact.distance, contact.uncertainty,
      _settings.availableDays, _settings.availableHours
    ).toISOString();
    contact.updatedAt = new Date().toISOString();
    await Store.saveContact(contact);
    _contacts = await Store.getAllContacts();
    _showList();
    // Schedule a real push notification for the rescheduled reminder
    _schedulePushForContact(contact);
    if (_settings.notificationsEnabled) {
      Notifications.notify(
        I18n.t('contacts.released'),
        Scheduler.formatApproxDate(contact.reminderDate, I18n.currentLang())
      );
    }
  }

  async function _deleteContact(id) {
    await Store.deleteContact(id);
    _contacts = await Store.getAllContacts();
    _showList();
  }

  function _confirmDelete(id, name) {
    const t = I18n.t.bind(I18n);
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <p>${t('contacts.deleteConfirm', { name: _esc(name) })}</p>
        <div class="dialog-actions">
          <button class="dialog-cancel">${t('general.cancel')}</button>
          <button class="dialog-confirm">${t('general.delete')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.dialog-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.dialog-confirm').addEventListener('click', () => {
      overlay.remove();
      _deleteContact(id);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async function _saveSettings(data, langChanged) {
    _settings = { ..._settings, ...data };
    await Store.saveSettings(_settings);
    if (langChanged) {
      await I18n.load(_settings.language);
      _showSettings(); // Re-render with new language
    }
  }

  async function _bootstrapNotifications() {
    _notificationState = Notifications.getSupportState();
    if (!_settings.notificationsEnabled) {
      return;
    }
    // Fetch VAPID key from ntfy.sh so we can restore the push subscription
    const vapidKey = await NtfyProvider.fetchVapidKey();
    const restored = await Notifications.restorePush({ applicationServerKey: vapidKey || undefined });
    _notificationState = { ..._notificationState, ...restored };
    if (!restored.enabled || restored.permission !== 'granted') {
      _settings.notificationsEnabled = false;
      await Store.saveSettings(_settings);
      Notifications.setEnabled(false);
      return;
    }
    // Re-register subscription with ntfy.sh on each app start (endpoint may have changed)
    const topic = NtfyProvider.getTopic();
    if (topic && restored.subscription) {
      NtfyProvider.registerSubscription(restored.subscription, topic); // fire and forget
    }
  }

  async function _toggleNotifications(enable) {
    if (!enable) {
      // Unregister from ntfy.sh before clearing the browser subscription
      const sub = Notifications.getSubscription();
      if (sub) {
        NtfyProvider.unregisterSubscription(sub); // fire and forget
      }
      Notifications.setEnabled(false);
      _settings.notificationsEnabled = false;
      await Store.saveSettings(_settings);
      await Notifications.disablePush();
      NtfyProvider.clearTopic();
      _notificationState = Notifications.getSupportState();
      return { ..._notificationState };
    }

    // Fetch ntfy.sh VAPID public key required to subscribe
    const vapidKey = await NtfyProvider.fetchVapidKey();
    if (!vapidKey) {
      return { enabled: false, permission: Notifications.getPermission(), subscription: null };
    }

    const result = await Notifications.enablePush({ applicationServerKey: vapidKey });

    if (result.enabled && result.subscription) {
      // Register this browser's push subscription with ntfy.sh for our topic.
      // If registration fails, disable push so the UI reflects the real state.
      const topic = NtfyProvider.getOrCreateTopic();
      const registered = await NtfyProvider.registerSubscription(result.subscription, topic);
      if (!registered) {
        // ntfy.sh unreachable or rejected — roll back
        await Notifications.disablePush();
        NtfyProvider.clearTopic();
        return { enabled: false, permission: result.permission, subscription: null };
      }
    }

    Notifications.setEnabled(result.enabled);
    _settings.notificationsEnabled = result.enabled;
    if (!result.enabled) {
      _settings.notificationsEnabled = false;
    }
    await Store.saveSettings(_settings);
    _notificationState = { ...Notifications.getSupportState(), ntfyTopic: NtfyProvider.getTopic() };
    return { ..._notificationState, permission: result.permission };
  }

  async function _promptInstall() {
    if (_isStandalone()) {
      Notifications.notify(I18n.t('settings.pwaInstalledTitle'), I18n.t('settings.pwaInstalledText'));
      return;
    }
    if (_installPrompt) {
      _installPrompt.prompt();
      await _installPrompt.userChoice;
      _installPrompt = null;
      _installAvailable = false;
      return;
    }
    Notifications.notify(I18n.t('settings.pwaManualTitle'), I18n.t('settings.pwaManualText'));
  }

  function _isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  }

  // --- Background checks ---

  /**
   * Schedule a real push notification via ntfy.sh for a contact's reminder date.
   * Only fires if push notifications are enabled and we have a ntfy.sh topic.
   * This is a fire-and-forget call; errors are silently ignored.
   */
  function _schedulePushForContact(contact) {
    if (!_settings.notificationsEnabled) return;
    const topic = NtfyProvider.getTopic();
    if (!topic || !contact.reminderDate) return;
    const deliverAt = new Date(contact.reminderDate);
    if (deliverAt.getTime() <= Date.now()) return; // Already in the past — skip
    NtfyProvider.scheduleNotification(
      topic,
      I18n.t('contacts.dueNow'),
      contact.name,
      deliverAt
    );
  }

  function _checkDueContacts() {
    const now = new Date();
    _contacts.forEach(c => {
      if (c.reminderDate && new Date(c.reminderDate) <= now && !c._notified) {
        if (_settings.notificationsEnabled) {
          Notifications.notify(
            I18n.t('contacts.dueNow'),
            c.name
          );
        }
        c._notified = true;
      }
    });
    // Re-render list view if it's currently showing
    if (_root.querySelector('.contact-list') || _root.querySelector('.empty-state')) {
      _showList();
    }
  }

  // --- Utilities ---

  function _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then((registration) => {
          _attachSWRegistration(registration);
        })
        .catch(() => {});
    }
  }

  function _attachSWRegistration(registration) {
    if (!registration || _swListenersBound) return;
    _swRegistration = registration;
    _swListenersBound = true;

    const handleWaitingWorker = async (worker) => {
      _waitingSW = worker;
      const waitingVersion = await _getWorkerVersion(worker);
      const installedVersion = localStorage.getItem(VERSION_STORAGE_KEY) || APP_VERSION;
      _pendingSWVersion = waitingVersion;
      _updateAvailable = waitingVersion
        ? _compareVersions(waitingVersion, installedVersion) > 0
        : true;
      if (_updateAvailable && _root && _root.querySelector('.settings')) {
        _showSettings();
      }
    };

    if (registration.waiting) {
      handleWaitingWorker(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          handleWaitingWorker(worker);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_pendingSWVersion) _trackInstalledVersion(_pendingSWVersion);
      window.location.reload();
    }, { once: true });
  }

  async function _ensureSWRegistration() {
    if (_swRegistration) return _swRegistration;
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        _attachSWRegistration(registration);
        return registration;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function _applyUpdate() {
    if (_waitingSW) {
      _waitingSW.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  async function _checkForUpdates() {
    const registration = await _ensureSWRegistration();
    if (registration && typeof registration.update === 'function') {
      try {
        await registration.update();
      } catch (e) {
        // no-op: update failures are silent by design
      }
    }
  }

  function _clearViewBindings() {
    if (typeof _unbindView === 'function') {
      _unbindView();
      _unbindView = null;
    }
  }

  function _trackInstalledVersion(version) {
    const current = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!current || _compareVersions(version, current) > 0) {
      localStorage.setItem(VERSION_STORAGE_KEY, version);
    }
  }

  function _compareVersions(left, right) {
    const leftParts = String(left).split('.').map((n) => parseInt(n, 10) || 0);
    const rightParts = String(right).split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < len; i++) {
      const a = leftParts[i] || 0;
      const b = rightParts[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  function _getWorkerVersion(worker) {
    return new Promise((resolve) => {
      if (!worker) {
        resolve(null);
        return;
      }
      const channel = new MessageChannel();
      const timeout = setTimeout(() => resolve(null), 1000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event?.data?.version || null);
      };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
  }

  return { init };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());

export default App;
