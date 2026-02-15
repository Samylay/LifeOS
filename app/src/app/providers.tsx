"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { IntegrationsProvider } from "@/lib/integrations-context";
import { AppShell } from "@/components/app-shell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <IntegrationsProvider>
        <AppShell>{children}</AppShell>
      </IntegrationsProvider>
    </AuthProvider>
  );
}
