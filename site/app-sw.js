// Moon app: keep the app working offline. Moon time and the moon are computed on the device, so only
// the app's own files are needed. Pages and files are served from the network when it's there.
const CACHE = 'moon-app-v101';
const FILES = ['/app', '/js/moon-phase.js', '/js/moonglow.js', '/js/sky.js', '/js/i18n.js', '/js/i18n/app-keys.js', '/js/qrcode.js', '/js/moonqr.js', '/js/app.js', '/app.webmanifest', '/assets/fonts/fonts.css',
  '/assets/fonts/inter-latin-400-normal.woff2', '/assets/fonts/syncopate-latin-700-normal.woff2', '/assets/fonts/jetbrains-mono-latin-400-normal.woff2',
  '/assets/app-icon-192.png', '/assets/favicon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const key = u.pathname === '/app' || u.pathname === '/app.html' ? '/app' : u.pathname;
  if (!FILES.includes(key)) return;
  // Network first, so updates show up; the cache when offline.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return r; })
    .catch(() => caches.match(key)));
});
