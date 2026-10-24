const CACHE = "pixbill-v5";
const SHELL = ["/", "/app.js", "/styles.css", "/vendor/chart.umd.js", "/manifest.webmanifest", "/icons/icon-192.png", "/fonts/manrope-latin-wght-normal.woff2", "/fonts/manrope-latin-ext-wght-normal.woff2", "/fonts/ibm-plex-mono-latin-500-normal.woff2", "/fonts/ibm-plex-mono-latin-600-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  const network = Promise.race([
    fetch(e.request),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
  ]);
  e.respondWith(
    network
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("/")))
  );
});
