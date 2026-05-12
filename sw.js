/* StayAwake v2 — Service Worker */
const CACHE = 'stayawake-v2';
const PRECACHE = [
  '/', '/index.html', '/how-it-works.html', '/faq.html',
  '/alternatives.html', '/about.html', '/privacy-policy.html',
  '/css/style.css', '/js/main.js', '/js/jiggler.js', '/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (['style','script','image','font'].includes(e.request.destination)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }))
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
