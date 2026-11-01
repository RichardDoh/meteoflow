// FO3S service worker — caches the built app shell so the tablet app itself
// (not just the observation data) keeps working with zero connectivity.
// This mirrors architecture doc §3: "the field application must never
// require Internet connectivity to perform its core observation-collection
// function." Data persistence is handled separately by IndexedDB (src/lib/db.ts);
// this worker's job is just making sure the app can load offline at all.

const CACHE_NAME = "fo3s-shell-v1";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Network-first for navigation & same-origin GETs, falling back to cache
// when offline. Whatever successfully loads over the network is cached for
// next time, so the shell self-heals as the app is updated.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
