/**
 * GEIS SVOZY – Service Worker (verze 4.2)
 *
 * Od verze 4.2 ho index.html REGISTRUJE (offline načtení aplikace).
 * Data z Firestore drží offline samotný Firebase (enablePersistence v index.html).
 *
 * 4.2: navíc se ukládají knihovny z CDN (Tailwind, Firebase SDK), aby se
 * appka bez signálu vůbec vykreslila. Volání databáze (firestore.googleapis.com)
 * se NIKDY necachují.
 *
 * Strategie je NETWORK-FIRST (dřív byla cache-first). Důvod: při cache-first
 * zůstal telefon viset na staré verzi index.html i po nasazení opravy a
 * uživatel viděl staré (chybné) chování. Network-first vždy zkusí síť a
 * cache použije jen když není připojení.
 */
const CACHE_NAME = 'geis-svozy-v4.2.0';

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

  const url = new URL(req.url);

  // Knihovny z CDN (Tailwind, Firebase SDK) – síť první, záloha z cache.
  const isCdnLib = url.hostname === 'cdn.tailwindcss.com' ||
                   (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0);
  if (isCdnLib) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  // Firestore a vše ostatní z cizích domén nikdy necachujeme – vždy živě ze sítě.
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
