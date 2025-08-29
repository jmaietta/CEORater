// service-worker.js — CEORater (GitHub Pages friendly, resilient)
const CACHE_NAME = 'ceorater-cache-v5';

// List ONLY files that truly exist in your repo.
// (No '/' entry — that breaks for project pages; index.html is enough.)
const CORE = [
  'index.html',
  'style.css',
  'script.js',
  'GoogleSheet.js',     // or GoogleSheet.proxy.js if you renamed it
  'manifest.json',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png'
];

// Install: cache core files, but don’t fail if one is missing.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of CORE) {
      try {
        const resp = await fetch(new Request(url, { cache: 'no-cache' }));
        if (resp.ok) await cache.put(url, resp.clone());
      } catch (e) {
        // Don’t abort install for missing assets
        console.warn('[SW] Skip caching', url, e);
      }
    }
    await self.skipWaiting();
  })());
});

// Activate: drop old caches & take control
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

// Fetch: same-origin only.
// - Navigations (HTML): network-first, fallback to cache
// - Static assets in CORE: cache-first
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return; // ignore cross-origin

  // Navigations
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const resp = await fetch(request);
        // Cache what the user actually navigated to (works for / and /CEORater/)
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, resp.clone());
        return resp;
      } catch {
        // Try to serve the exact request, else fallback to the cached index.html
        return (await caches.match(request)) ||
               (await caches.match('index.html')) ||
               new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Static assets
  if (CORE.some(p => request.url.endsWith(p))) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, resp.clone());
        return resp;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
  }
});
