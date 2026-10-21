const CACHE_NAME = 'whatever-pwa-v99';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isStylesheetOrScript = /\.(?:css|js)(?:$|\?)/i.test(new URL(event.request.url).pathname);
  if (!isStylesheetOrScript) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) =>
        cachedResponse || fetch(event.request).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});