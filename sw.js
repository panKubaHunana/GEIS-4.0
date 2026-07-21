const CACHE_NAME = 'sw-v53';

// Relativní cesty zajišťují kompatibilitu na jakékoliv doméně/složce na GitHubu
const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'style.css',
  'icon-192.png'
];

// Instalace a uložení nezbytných souborů do paměti (cache)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) 
  );
});

// Aktivace nového Service Workeru a smazání starých verzí mezipaměti
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Strategie Cache-First s přechodem na síť
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
