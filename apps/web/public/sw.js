/**
 * App-shell service worker (low-connectivity Level 2).
 *
 * Deliberately narrow: cache-first for this origin's own static build
 * assets and page shells, network-only for everything else. In particular:
 *
 *  - Never intercepts a cross-origin request. The API and identity provider
 *    live on separate hostnames (witness-api.*, witness-id.*) specifically
 *    so a service worker scoped to the web origin structurally cannot cache
 *    a response carrying a session token, consent decision, or contribution
 *    content — there is nothing here to write a rule for wrong.
 *  - Never intercepts a non-GET request. A queued POST is the offline
 *    contribution queue's job (`lib/offline-queue.ts`, IndexedDB, replayed
 *    with an idempotency key) — a service worker silently "handling" a
 *    write offline would be a second, uncoordinated queue with no
 *    idempotency key and no visible pending state.
 *
 * What this buys: the app shell (HTML entry, JS/CSS bundles) loads from
 * cache when the network is down or slow, so a participant on a bad
 * connection sees the page and can act on whatever the offline queue is
 * already holding, instead of a blank tab.
 */

const CACHE_NAME = 'witness-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Static, hashed build assets: cache-first, they never change under the
  // same URL. Page navigations: network-first with a cache fallback, so a
  // signed-in user always sees fresh content when online and the shell
  // still loads when they are not.
  const isStaticAsset = url.pathname.includes('/_next/static/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/'))),
    );
  }
});
