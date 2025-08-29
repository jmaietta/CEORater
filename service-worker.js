/* CEORater SW v47 — API-only, zero overhead for static assets */

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const API_CACHE = 'api-cache-v1';

// Treat only your API as cacheable (same-origin /api/* or the Cloud Run origin)
function isApiRequest(req) {
  if (req.method !== 'GET') return false;
  try {
    const url = new URL(req.url);
    const sameOriginApi = url.origin === self.location.origin && url.pathname.startsWith('/api/');
    const cloudRunApi = /ceorater-backend-.*\.run\.app$/.test(url.hostname);
    return sameOriginApi || cloudRunApi;
  } catch {
    return false;
  }
}

// Stale-while-revalidate for API; everything else: pass through (no respondWith)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!isApiRequest(req)) return; // don’t intercept static files or navigations

  event.respondWith((async () => {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(req);

    const network = fetch(req).then(res => {
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => cached);

    // Return cached immediately if present; otherwise wait for network
    return cached || network;
  })());
});
