/**
 * App-shell service worker (low-connectivity Level 2).
 *
 * Deliberately narrow: cache-first for this origin's hashed static build
 * assets, network-only for everything else. In particular:
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
 * What this buys: immutable JS/CSS assets remain available on poor links
 * without ever persisting session-dependent HTML.
 */

// Bump whenever shell auth/session rendering changes so an older cached
// document cannot show a signed-out Home beside authenticated navigation.
const CACHE_NAME = 'witness-shell-v3';

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

  // Static, hashed build assets are safe cache-first: they never change under
  // the same URL and contain no response data for a particular session.
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

  // Cookie-authenticated HTML can vary by browser session. Never persist or
  // replay navigation responses; offline support is limited to hashed assets.
});
