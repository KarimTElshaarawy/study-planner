/* Dayfold service worker: app shell offline, API always from the network (the app keeps its own query cache). */
const VERSION = 'dayfold-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch('/', { cache: 'reload' });
        const html = await res.clone().text();
        await cache.put('/', res);
        const assets = [...new Set(html.match(/\/(assets|icons)\/[^"')\s]+/g) ?? [])];
        await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
        await cache.add('/manifest.webmanifest').catch(() => undefined);
      } catch {
        // offline during install; runtime caching will fill in
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // never cache an HTML fallback under a script or style URL
          const type = res.headers.get('content-type') ?? '';
          if (res.ok && !(type.includes('text/html') && !req.url.endsWith('/'))) {
            const copy = res.clone();
            void caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
