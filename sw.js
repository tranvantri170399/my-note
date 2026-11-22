const CACHE_NAME = 'my-note-vault-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/crypto.js',
  './js/gist.js',
  './js/reminder.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Chỉ xử lý tài nguyên cùng origin; tuyệt đối không can thiệp GitHub API
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkRes;
      })
      .catch(() => caches.match(request))
  );
});
