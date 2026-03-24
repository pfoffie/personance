/**
 * Personance — Main App Controller
 * Handles routing between views, data flow, and lifecycle.
 */
import Store from './store.js';
import I18n from './i18n.js';
import Scheduler from './scheduler.js';
import Notifications from './notifications.js';
import PushProvider from './push.js';
import ContactListView from './views/contactList.js';
import ContactEditorView from './views/contactEditor.js';
import SettingsView from './views/settings.js';
import IntroView from './views/intro.js'

const APP_VERSION = '1.4.1';
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
  let _notificationState = { permission: 'default', pushSupported: false, enabled: false, pushConfigured: false };

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
    const hadValidSavedLanguage = ['en', 'de', 'es'].includes(_settings.language);
    const browserLang = (navigator.language || 'en').toLowerCase().substring(0, 2);
    const supportedLangs = ['en', 'de', 'es'];
    const preferredBrowserLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
    const lang = supportedLangs.includes(_settings.language) ? _settings.language : preferredBrowserLang;
    const hadUserId = typeof _settings.userId === 'string' && _settings.userId.trim().length > 0;
    if (!hadUserId) {
      _settings.userId = _generateUserId();
    }
    _settings.language = lang;
    await I18n.load(lang);
    if (!hadValidSavedLanguage || !hadUserId) {
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
      pushConfigured: PushProvider.isConfigured(),
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
      onClearCache: () => _clearCacheAndReload(),
      onExportData: () => _exportData(),
      onImportData: (file) => _importData(file),
      onBack: () => _showList(),
    });
  }

  // --- Actions ---

  async function _saveContact(existingId, data) {
    let contact;
    if (existingId) {
      contact = await Store.getContact(existingId);
      // Remove any previously scheduled push notification for this contact.
      if (contact.pushNotificationId) {
        PushProvider.removeNotification(contact.pushNotificationId);
        contact.pushNotificationId = null;
      }
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
    _showList();
    // Schedule a push notification for the new reminder date and persist the ID
    _schedulePushForContact(contact).then(async (pushId) => {
      if (pushId) {
        contact.pushNotificationId = pushId;
        await Store.saveContact(contact);
      }
    });
  }

  async function _releaseContact(id) {
    const contact = await Store.getContact(id);
    if (!contact) return;
    // Remove any previously scheduled push notification for this contact.
    if (contact.pushNotificationId) {
      PushProvider.removeNotification(contact.pushNotificationId);
      contact.pushNotificationId = null;
    }
    // Reschedule
    contact.reminderDate = Scheduler.computeNextReminder(
      contact.distance, contact.uncertainty,
      _settings.availableDays, _settings.availableHours
    ).toISOString();
    contact.updatedAt = new Date().toISOString();
    await Store.saveContact(contact);
    _contacts = await Store.getAllContacts();
    _showList();
    // Schedule a push notification for the rescheduled reminder and persist the ID
    _schedulePushForContact(contact).then(async (pushId) => {
      if (pushId) {
        contact.pushNotificationId = pushId;
        await Store.saveContact(contact);
      }
    });
    if (_settings.notificationsEnabled) {
      Notifications.notify(
        I18n.t('contacts.released'),
        Scheduler.formatApproxDate(contact.reminderDate, I18n.currentLang())
      );
    }
  }

  async function _deleteContact(id) {
    const contact = await Store.getContact(id);
    if (contact && contact.pushNotificationId) {
      PushProvider.removeNotification(contact.pushNotificationId);
    }
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
    // Load the custom push provider module (no-op when custom/push.js is absent).
    await PushProvider.init();
    _notificationState = {
      ...Notifications.getSupportState(),
      pushConfigured: PushProvider.isConfigured(),
    };
    if (!_settings.notificationsEnabled) return;
    if (Notifications.getPermission() !== 'granted') {
      _settings.notificationsEnabled = false;
      await Store.saveSettings(_settings);
      Notifications.setEnabled(false);
      return;
    }
    // Re-register with the push provider on startup if configured.
    // Fire-and-forget: scheduleNotification() will await this before using the userId.
    if (PushProvider.isConfigured()) {
      PushProvider.registerNotifications(); // intentional fire-and-forget
    }
  }

  async function _toggleNotifications(enable) {
    if (!enable) {
      Notifications.setEnabled(false);
      _settings.notificationsEnabled = false;
      await Store.saveSettings(_settings);
      _notificationState = {
        ...Notifications.getSupportState(),
        pushConfigured: PushProvider.isConfigured(),
      };
      return { ..._notificationState };
    }

    // Request browser notification permission.
    const perm = Notifications.getPermission() === 'default'
      ? await Notifications.requestPermission()
      : Notifications.getPermission();

    if (perm !== 'granted') {
      return {
        enabled: false,
        permission: perm,
        pushSupported: Notifications.isSupported(),
        pushConfigured: PushProvider.isConfigured(),
      };
    }

    // Register with the custom push provider if configured.
    if (PushProvider.isConfigured()) {
      await PushProvider.registerNotifications();
    }

    Notifications.setEnabled(true);
    _settings.notificationsEnabled = true;
    await Store.saveSettings(_settings);
    _notificationState = {
      ...Notifications.getSupportState(),
      pushConfigured: PushProvider.isConfigured(),
    };
    return { ..._notificationState, permission: perm };
  }

  async function _exportData() {
    const payload = {
      settings: _settings,
      items: _contacts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personance.json';
    link.click();
    URL.revokeObjectURL(url);
    Notifications.notify(I18n.t('settings.exportSuccessTitle'), I18n.t('settings.exportSuccessText'));
  }

  async function _importData(file) {
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const importedItems = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed?.contacts) ? parsed.contacts : null);
      if (!importedItems || typeof parsed?.settings !== 'object' || parsed.settings === null) {
        throw new Error('invalid import file');
      }
      const importedContacts = importedItems
        .map((item) => _normalizeImportedContact(item))
        .filter((item) => item !== null);
      const importedSettings = _sanitizeImportedSettings(parsed.settings);
      if (!importedSettings.userId) {
        importedSettings.userId = _settings.userId || _generateUserId();
      }
      await Store.clearContacts();
      for (const contact of importedContacts) {
        await Store.saveContact(contact);
      }
      _settings = importedSettings;
      await Store.saveSettings(_settings);
      if (I18n.currentLang() !== _settings.language && ['en', 'de', 'es'].includes(_settings.language)) {
        await I18n.load(_settings.language);
      }
      Notifications.setEnabled(!!_settings.notificationsEnabled);
      _contacts = await Store.getAllContacts();
      _showList();
      Notifications.notify(I18n.t('settings.importSuccessTitle'), I18n.t('settings.importSuccessText'));
    } catch (_) {
      Notifications.notify(I18n.t('settings.importErrorTitle'), I18n.t('settings.importErrorText'));
    }
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
   * Schedule a push notification for a contact's reminder date via the custom provider.
   * @returns {Promise<string|null>}  message ID or null
   */
  async function _schedulePushForContact(contact) {
    if (!_settings.notificationsEnabled) return null;
    if (!PushProvider.isConfigured()) return null;
    if (!contact.reminderDate) return null;
    const deliverAt = new Date(contact.reminderDate);
    if (deliverAt.getTime() <= Date.now()) return null;
    return PushProvider.scheduleNotification(
      deliverAt.getTime(),
      contact.name
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

  function _generateUserId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return _generateId();
  }

  function _normalizeImportedContact(contact) {
    if (!contact || typeof contact !== 'object') return null;
    const name = typeof contact.name === 'string' ? contact.name.trim() : '';
    if (!name) return null;
    const distance = _clampInt(contact.distance, 1, 365, 90);
    const uncertainty = _clampInt(contact.uncertainty, 0, 100, 50);
    const reminderDate = _validIso(contact.reminderDate) || Scheduler.computeNextReminder(
      distance, uncertainty, _settings.availableDays, _settings.availableHours
    ).toISOString();
    const nowIso = new Date().toISOString();
    return {
      id: typeof contact.id === 'string' && contact.id.trim() ? contact.id : _generateId(),
      name,
      distance,
      uncertainty,
      reminderDate,
      createdAt: _validIso(contact.createdAt) || nowIso,
      updatedAt: _validIso(contact.updatedAt) || nowIso,
    };
  }

  function _sanitizeImportedSettings(settings) {
    const next = { ...Store.DEFAULT_SETTINGS };
    if (typeof settings.language === 'string' && ['en', 'de', 'es'].includes(settings.language)) {
      next.language = settings.language;
    }
    if (Array.isArray(settings.availableDays)) {
      const days = Array.from(new Set(settings.availableDays.map((d) => _clampInt(d, 0, 6, null)).filter((d) => d !== null)));
      if (days.length > 0) next.availableDays = days;
    }
    if (Array.isArray(settings.availableHours)) {
      const hours = Array.from(new Set(settings.availableHours.map((h) => _clampInt(h, 0, 23, null)).filter((h) => h !== null)));
      if (hours.length > 0) next.availableHours = hours;
    }
    next.notificationsEnabled = !!settings.notificationsEnabled;
    next.surpriseMode = !!settings.surpriseMode;
    if (typeof settings.userId === 'string' && settings.userId.trim()) {
      next.userId = settings.userId.trim();
    }
    return next;
  }

  function _clampInt(value, min, max, fallback) {
    const num = Number.parseInt(value, 10);
    if (Number.isNaN(num)) return fallback;
    if (num < min || num > max) return fallback;
    return num;
  }

  function _validIso(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`sw.js?v=${APP_VERSION}`, { updateViaCache: 'none' })
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

  async function _clearCacheAndReload() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.unregister();
      }
    } catch (e) {
      // no-op: failures are silent by design
    }
    window.location.reload();
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
