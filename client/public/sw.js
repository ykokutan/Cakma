const CACHE_NAME = 'cakma-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/socket.io')) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
