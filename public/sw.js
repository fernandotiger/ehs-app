/* EHS Platform service worker
 *
 * Strategy
 *  - Static build assets (/_next/static, icons, fonts): cache-first (immutable, hashed).
 *  - Page navigations + RSC payloads: network-first, fall back to the cached copy, then /offline.
 *  - API GET requests: network-first with cache fallback so previously viewed data works offline.
 *  - Document file downloads: network-first, cached for offline reading.
 *  - Non-GET requests are never intercepted – offline writes go through the IndexedDB outbox.
 */

const VERSION = "v1";
const STATIC_CACHE = `ehs-static-${VERSION}`;
const PAGES_CACHE = `ehs-pages-${VERSION}`;
const API_CACHE = `ehs-api-${VERSION}`;
const FILES_CACHE = `ehs-files-${VERSION}`;

const PRECACHE_URLS = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
/** App routes warmed after sign-in so the core screens open offline. */
const WARM_ROUTES = ["/dashboard", "/my-work", "/documents"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("ehs-") && !k.endsWith(VERSION)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "WARM_ROUTES") {
    event.waitUntil(warmRoutes());
  }
  if (event.data?.type === "CLEAR_USER_CACHES") {
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(FILES_CACHE), caches.delete(PAGES_CACHE)]));
  }
});

async function warmRoutes() {
  const cache = await caches.open(PAGES_CACHE);
  await Promise.all(
    WARM_ROUTES.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch {
        /* offline – ignore */
      }
    }),
  );
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname);
}

function isFileDownload(url) {
  return /^\/api\/documents\/[^/]+\/versions\/[^/]+\/file$/.test(url.pathname) || /^\/api\/evidence\/[^/]+\/file$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Auth endpoints and sync must always hit the network.
  if (url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/uploads") || url.pathname === "/sw.js") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (isFileDownload(url)) {
    event.respondWith(networkFirst(request, FILES_CACHE, { ignoreSearch: true }));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }
  // RSC payloads for client-side navigation.
  if (request.headers.get("RSC") === "1") {
    event.respondWith(
      fetch(request).catch(async () => {
        // Returning an error makes Next fall back to a full navigation, which the
        // navigation handler can then serve from cache.
        return Response.error();
      }),
    );
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, matchOptions) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, matchOptions);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: { code: "NETWORK_ERROR", message: "You are offline" } }), {
      status: 503,
      headers: { "Content-Type": "application/json", "X-Offline": "1" },
    });
  }
}

async function navigation(request) {
  const cache = await caches.open(PAGES_CACHE);
  const url = new URL(request.url);
  const key = url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && url.pathname !== "/login") cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    const offline = await caches.match("/offline");
    return offline ?? new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
