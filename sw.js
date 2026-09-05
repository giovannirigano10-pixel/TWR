const CACHE = "twr-v2";
const CORE = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-180.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // le chiamate alle funzioni serverless vanno sempre in rete, mai in cache:
  // sono dati live (prezzi) e una risposta di errore non deve mai restare "congelata".
  if (req.url.includes("/.netlify/functions/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); }
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
