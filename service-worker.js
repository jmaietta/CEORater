// service-worker.js

// Define a name for the cache
const CACHE_NAME = 'ceorater-cache-v2'; // Incremented cache version

// List only the essential local files that make up the app shell
const urlsToCacheOnInstall = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'ui.js',
  'utils.js',
  'GoogleSheet.js',
  'firebase-config.js',
  'apple-touch-icon.png',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'manifest.json'
];

// --- EVENT LISTENERS ---

// 1. Install Event: Caches the core app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(urlsToCacheOnInstall);
      })
  );
});

// 2. Fetch Event: Implements a "Network falling back to cache" strategy.
self.addEventListener('fetch', event => {
  event.respondWith(
    // Try to fetch from the network first
    fetch(event.request)
      .then(networkResponse => {
        // If the fetch is successful, cache the new response and return it
        return caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
      })
      .catch(() => {
        // If the network fetch fails (e.g., offline), try to get it from the cache
        return caches.match(event.request);
      })
  );
});

// 3. Activate Event: Cleans up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If the cache name is not in our whitelist, delete it
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
