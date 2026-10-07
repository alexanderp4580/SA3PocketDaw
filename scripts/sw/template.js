/* App-shell service worker body. Constants CACHE_NAME and PRECACHE come from make-sw.mjs. */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of staleCacheNames(await caches.keys(), CACHE_NAME)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!isHandled(request, self.location.origin)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      return respond({ request, cache, fetchFn: (r) => fetch(r), origin: self.location.origin });
    })(),
  );
});
