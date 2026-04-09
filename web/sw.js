const CACHE_NAME = 'matchmaker-v23';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './i18n.js',
  './storage.js',
  './scheduler.js',
  './app.js',
  './manifest.json',
  './logo.png',
  './logo-192.png',
  './logo-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
