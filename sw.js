/* Carnet de budget — fonctionne hors ligne : réseau d'abord, cache en secours. */
const CACHE = "carnet-budget-v3";
const ASSETS = ["./", "./index.html", "./styles.css", "./js/app.js", "./js/parser.js", "./js/drive.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || /googleapis\.com|accounts\.google\.com/.test(u.host)) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || /cdnjs|fonts\.(googleapis|gstatic)/.test(u.host))) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
});
