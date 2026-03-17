/**
 * Personance — Service Worker
 * Caches all app assets for full offline support.
 */
const APP_VERSION = '1.2.3';
const CACHE_NAME = `personance-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/i18n.js',
  './js/store.js',
  './js/scheduler.js',
  './js/notifications.js',
  './js/ntfy.js',
  './js/views/contactList.js',
  './js/views/contactEditor.js',
  './js/views/settings.js',
  './lang/en.json',
  './lang/de.json',
  './manifest.json',
  './assets/icons/icon_192.png',
  './assets/icons/icon_512.png',
  './assets/icons/icon_180.png',
];

// Install — cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Allow clients to activate an already-installed update immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'VERSION', version: APP_VERSION });
    return;
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache same-origin GET requests
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push notification handler — supports both ntfy.sh payload format and plain format
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  // ntfy.sh wraps messages as: { event: "message", subscription_id: "…", message: { title, message, … } }
  let title = 'Personance';
  let body = '';
  if (data.event === 'message' && data.message) {
    title = data.message.title || 'Personance';
    body = data.message.message || '';
  } else {
    title = data.title || 'Personance';
    body = data.body || '';
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './assets/icons/icon_192.png',
      badge: './assets/icons/icon_192.png',
      data,
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
