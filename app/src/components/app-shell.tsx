"use client";

import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { ChatPanel } from "./chat-panel";
import { useAppStore } from "@/lib/store";

// Single-user, tailnet-only: no auth gate, no public pages, no login screen.
export function AppShell({ children }: { children: ReactNode }) {
  const { sidebarExpanded } = useAppStore();

  return (
    <div
      className="min-h-screen bg-surface-1"
      style={{ ["--sidebar-width" as string]: sidebarExpanded ? "244px" : "72px" }}
    >
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-(--z-focus-overlay) -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-transform duration-[var(--dur-fast)] focus:translate-y-0"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar mobile />
      </div>
      <TopBar />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <div className="app-content">{children}</div>
      </main>
      {/* Mobile bottom nav - hidden on desktop */}
      <BottomNav />
      {/* Chat panel — right side drawer */}
      <ChatPanel />
    </div>
  );
}
