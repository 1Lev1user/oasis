// Offline cache: stale-while-revalidate for the game's own files. No file list: every same-origin GET is cached as it is fetched.
const VERSION = 'v1';
const CACHE = `oasis-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('oasis-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page lists what it loaded before the worker controlled it; cache those same-origin files too.
self.addEventListener('message', (event) => {
  const urls = Array.isArray(event.data) ? event.data.filter((u) => typeof u === 'string' && new URL(u).origin === location.origin) : [];
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(urls.map((u) => cache.add(u)))));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });
      if (!cached) return network;
      network.catch(() => {});
      return cached;
    }),
  );
});
