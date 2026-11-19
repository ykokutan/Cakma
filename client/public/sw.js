const CACHE_NAME = 'cakma-pwa-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/app-icon.png',
  '/noise-suppressor-worklet.js',
];

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
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
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

  // Stale-while-revalidate for static assets (/assets/*, icons, worklets)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
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
