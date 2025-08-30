// service-worker.js — robust precache for GitHub Pages
// - Only caches same-origin, relative assets
// - Skips any asset that fails instead of aborting install
// - No CDN URLs in precache (cache them at runtime if desired)

const CACHE_NAME = 'ceorater-cache-v5';

// adjust this list to match files you actually ship in /www
const APP_SHELL = [
  './',
  'index.html',
  'output.css',
  'script.js',
  'auth.js',
  'firebase-config.js',
  'firebase-init.js',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'apple-touch-icon.png',
  'manifest.json'
];

// Normalize to absolute URLs under the SW scope
const toScopedURL = (p) => new URL(p, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of APP_SHELL) {
      const url = toScopedURL(path);
      try {
        const res = await fetch(new Request(url, { cache: 'no-cache' }));
        if (res.ok) {
          await cache.put(url, res.clone());
        } else {
          console.warn('[SW] Skip precache (non-OK):', url, res.status);
        }
      } catch (err) {
        console.warn('[SW] Skip precache (fetch failed):', url, err && err.message);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map((n) => (n === CACHE_NAME ? undefined : caches.delete(n)))
    );
    await self.clients.claim();
  })());
});

// Cache-first for same-origin GETs to your site only.
// External CDNs are left to the network by default.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === new URL(self.registration.scope).origin;

  if (!sameOrigin) return; // no runtime caching for CDNs by default

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // only cache successful, basic (same-origin) responses
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // optional: return offline fallback here if you have one
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
