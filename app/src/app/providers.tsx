"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { IntegrationsProvider } from "@/lib/integrations-context";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <IntegrationsProvider>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </IntegrationsProvider>
    </AuthProvider>
  );
}
