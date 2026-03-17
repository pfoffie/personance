/**
 * Personance — Service Worker
 * Caches all app assets for full offline support.
 */

const APP_VERSION = '1.3.0';
const CACHE_NAME = `personance-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=1.3.0',
  './js/app.js',
  './js/i18n.js',
  './js/store.js',
  './js/scheduler.js',
  './js/notifications.js',
  './js/push.js',
  './js/views/contactList.js',
  './js/views/contactEditor.js',
  './js/views/settings.js',
  './lang/en.json',
  './lang/de.json',
  './manifest.json',
  './assets/icons/icon_192.png',
  './assets/icons/icon_512.png',
  './assets/icons/icon_180.png',
  './push-config.js',
  './OneSignalSDKWorker.js',
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

// Notification click handler — focus or open the app window
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
