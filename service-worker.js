// service-worker.js

// Define a name for the cache
const CACHE_NAME = 'ceorater-cache-v1';

// List all the files that should be cached
const urlsToCache = [
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
  'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.22.0/firebase-app-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.22.0/firebase-auth-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.22.0/firebase-firestore-compat.min.js'
];

// --- EVENT LISTENERS ---

// 1. Install Event: Caches all the essential files.
self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Fetch Event: Intercepts network requests and serves cached files if available.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response from the cache
        if (response) {
          return response;
        }

        // Not in cache - fetch from the network
        return fetch(event.request);
      }
    )
  );
});

// 3. Activate Event: Cleans up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
