// Service worker: lets the installed app open offline.
// It caches only this app's own static files. Expense entries are
// NOT cached here - they live in the browser's local storage already.
var CACHE = "expense-tracker-v2";
var FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    })
  );
  self.clients.claim();
});

// Cache-first: serve the saved copy, fall back to the network.
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      return hit || fetch(event.request);
    })
  );
});
