// LifeOS service worker — web-push only. No caching, no offline logic:
// its single job is rendering pushed notifications and opening the pushed
// message's in-app path (payload `url`, /pager when absent) on tap.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
