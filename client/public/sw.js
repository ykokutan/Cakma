const CACHE_NAME = 'cakma-pwa-v4';
const MEDIA_CACHE_NAME = 'cakma-media-v4';
const MAX_MEDIA_ENTRIES = 80;
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/app-icon.png',
  '/noise-suppressor-worklet.js',
];

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch {}
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keepCaches = new Set([CACHE_NAME, MEDIA_CACHE_NAME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keepCaches.has(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/downloads/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  // Network-first for HTML navigations so fresh deployments apply immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  const isMediaAsset = /\.(png|jpe?g|webp|gif|svg|woff2?|ttf)$/i.test(url.pathname);
  const targetCache = isMediaAsset ? MEDIA_CACHE_NAME : CACHE_NAME;

  // Stale-while-revalidate for static assets (/assets/*, icons, worklets, fonts/images)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches
              .open(targetCache)
              .then((cache) => cache.put(event.request, copy))
              .then(() => (isMediaAsset ? trimCache(MEDIA_CACHE_NAME, MAX_MEDIA_ENTRIES) : undefined))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Çakma',
    body: 'Yeni bir bildiriminiz var.',
    url: '/',
    channelId: undefined,
    dmUsername: undefined,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: {
        url: payload.url || '/',
        channelId: payload.channelId || null,
        dmUsername: payload.dmUsername || null,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl = data.url || '/';
  const navPayload = {
    type: 'CAKMA_NOTIFICATION_NAVIGATE',
    url: targetUrl,
    channelId: data.channelId || null,
    dmUsername: data.dmUsername || null,
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('postMessage' in client) {
          client.postMessage(navPayload);
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
