/**
 * GEIS SVOZY – Service Worker (verze 4.1)
 *
 * POZOR: index.html tento soubor ZÁMĚRNĚ neregistruje. Aplikace funguje
 * i bez něj (data jsou stejně online z Firestore). Chceš-li offline režim,
 * přidej do index.html před </body> tento řádek:
 *
 *   <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');}</script>
 *
 * Strategie je NETWORK-FIRST (dřív byla cache-first). Důvod: při cache-first
 * zůstal telefon viset na staré verzi index.html i po nasazení opravy a
 * uživatel viděl staré (chybné) chování. Network-first vždy zkusí síť a
 * cache použije jen když není připojení.
 */
const CACHE_NAME = 'geis-svozy-v4.1.0';

const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'style.css',
  'pending-imports.js',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // addAll spadne, když jediný soubor chybí – proto po jednom a s tolerancí
      .then(cache => Promise.all(urlsToCache.map(u => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(n => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Firestore / Firebase / CDN nikdy necachujeme – vždy živě ze sítě.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
