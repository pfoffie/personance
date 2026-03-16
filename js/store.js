/**
 * Personance — IndexedDB persistence layer
 * Stores contacts and settings. All methods return Promises.
 */
const Store = (() => {
  const DB_NAME = 'personance';
  const DB_VERSION = 3;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        } else {
          const settingsStore = tx.objectStore('settings');
          if (settingsStore.keyPath !== 'key') {
            db.deleteObjectStore('settings');
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _tx(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function _req(idbReq) {
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = () => resolve(idbReq.result);
      idbReq.onerror = () => reject(idbReq.error);
    });
  }

  // --- Contacts ---

  function getAllContacts() {
    return _req(_tx('contacts', 'readonly').getAll());
  }

  function getContact(id) {
    return _req(_tx('contacts', 'readonly').get(id));
  }

  function saveContact(contact) {
    return _req(_tx('contacts', 'readwrite').put(contact));
  }

  function deleteContact(id) {
    return _req(_tx('contacts', 'readwrite').delete(id));
  }

  // --- Settings ---

  const DEFAULT_SETTINGS = {
    language: null,
    availableDays: [1, 2, 3, 4, 5], // 0=Sun, 1=Mon ... 6=Sat
    availableHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    notificationsEnabled: false,
    surpriseMode: false,
  };

  async function getSettings() {
    const row = await _req(_tx('settings', 'readonly').get('global'));
    if (!row) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...row.value };
  }

  async function saveSettings(settings) {
    return _req(_tx('settings', 'readwrite').put({ key: 'global', value: settings }));
  }

  return { open, getAllContacts, getContact, saveContact, deleteContact, getSettings, saveSettings, DEFAULT_SETTINGS };
})();

export default Store;
