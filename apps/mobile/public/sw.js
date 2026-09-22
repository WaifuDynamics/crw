// CRW+ service worker. Keeps the app shell available offline and loads fast on repeat
// visits. Only same-origin static files are cached: the API, maps, Google sign-in and the
// rep counter are always fetched live so nothing personal or stale is served from cache.
const VERSION = 'crw-v3'; // bump when precached files (icons) change
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Hashed bundles and assets never change under the same URL: cache first.
const immutable = (url) => url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads (every client-side route serves index.html): network first so a new
  // deploy shows up immediately, the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) || caches.match('/offline.html')),
    );
    return;
  }

  if (immutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Icons, manifest and the rest: fresh when online, cached when not.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
