const CACHE_NAME = 'chord-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css?v=8',
  './audio.js?v=8',
  './data.js?v=8',
  './state.js?v=8',
  './theory.js?v=8',
  './ui.js?v=8',
  './app.js?v=8',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
