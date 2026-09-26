"use client";

import { useEffect } from "react";

export function NotificationNavigation() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "LIFEOS_DISPLAY_MODE" && event.ports[0]) {
        event.ports[0].postMessage({ standalone: window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone) });
      }
    };
    navigator.serviceWorker.addEventListener("message", receive);
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => registration.update()).catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("message", receive);
  }, []);
  return null;
}
