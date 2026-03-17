const CACHE = 'atria-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'notify') return;
  await self.registration.showNotification(event.data.title, {
    body: event.data.body,
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    data: { url: './index.html' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || './index.html'));
});
