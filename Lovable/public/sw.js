// AppTreino service worker: lets browsers install the app and opens it without a connection.
// Network first: every load fetches the latest deploy, so no cache version ever needs bumping.
// The cache is only a fallback. Calls to the Apps Script API (another origin) pass through.
const CACHE = "apptreino";
const SHELL = "./";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Offline deep link: serve the app shell, whose router then renders the right screen.
        const shell = request.mode === "navigate" ? await caches.match(SHELL) : undefined;
        return shell || Response.error();
      }),
  );
});
