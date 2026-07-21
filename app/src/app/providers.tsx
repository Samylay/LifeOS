"use client";

import { ReactNode, useEffect } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: ReactNode }) {
  // Keep the web-push service worker registered/updated on every visit so an
  // already-subscribed device picks up sw.js changes without re-enabling push.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </AuthProvider>
  );
}
