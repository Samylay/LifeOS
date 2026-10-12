// LifeOS service worker. Two jobs: render pushed notifications and open the
// pushed message's in-app path (payload `url`, /pager when absent) on tap,
// and show /offline.html when a page navigation fails because the network is
// unreachable. The only cached file is /offline.html. No API or asset caching.
const OFFLINE_CACHE = "lifeos-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // A failed precache must not block installing the push handler.
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Navigation requests only. Everything else (API calls, assets, RSC fetches)
// goes straight to the network because this handler never calls respondWith.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return cached || new Response("LifeOS is not reachable.", { status: 503, headers: { "Content-Type": "text/plain" } });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "LifeOS", body: "", tag: "lifeos", url: "/pager" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  // Absolute in-app paths only — same guard as the notify gateway.
  const url =
    typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
      ? data.url
      : "/pager";
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag, // collapses repeated pushes of the same stream
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    })
  );
});

// Prefer the installed app over a browser tab when both are open.
function isStandalone(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.standalone === true);
    };
    client.postMessage({ type: "LIFEOS_DISPLAY_MODE" }, [channel.port2]);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.url;
  const path = typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/pager";
  const url = new URL(path, self.registration.scope);
  if (url.origin !== self.location.origin) url.href = new URL("/pager", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const local = windows.filter(client => new URL(client.url).origin === self.location.origin);
    const modes = await Promise.all(local.map(isStandalone));
    const app = local.find((client, index) => modes[index]);
    if (app) {
      const navigated = await app.navigate(url.href);
      return (navigated || app).focus();
    }
    // Chrome can route an in-scope openWindow call into the installed app.
    // Reusing an arbitrary browser tab prevents that routing.
    return self.clients.openWindow(url.href);
  })());
});
