"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { LoginScreen } from "./login-screen";

const PUBLIC_PATHS = ["/privacy"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { sidebarExpanded } = useAppStore();
  const { user, loading, isFirebaseConfigured } = useAuth();

  // Public pages render without auth or app chrome
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // If Firebase isn't configured, skip auth and show the app in demo mode
  if (isFirebaseConfigured && !user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <TopBar />
      <main
        className="transition-all p-4 lg:p-6"
        style={{
          marginLeft: 0,
          transitionDuration: "var(--duration-slow)",
          maxWidth: 1280,
          paddingBottom: 80, // space for bottom nav on mobile
        }}
      >
        <style>{`
          @media (min-width: 1024px) {
            main {
              margin-left: ${sidebarExpanded ? 256 : 64}px !important;
              padding-bottom: 24px !important;
            }
          }
        `}</style>
        {children}
      </main>
      {/* Mobile bottom nav - hidden on desktop */}
      <BottomNav />
    </div>
  );
}
