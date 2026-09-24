const VERSION = "sourcing-calc-1.5.0";
const ASSETS = [
  "./",
  "./index.html",
  "./options.html",
  "./sidepanel.css",
  "./calc.js",
  "./store.js",
  "./sites-ui.js",
  "./sidepanel.js",
  "./options.js",
  "./site.webmanifest",
  "./icons/16.png",
  "./icons/48.png",
  "./icons/128.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
