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
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar mobile />
      </div>
      <TopBar />
      <main
        className="p-4 lg:p-6"
        style={{
          marginLeft: 0,
          maxWidth: 1280,
          // space for the bottom nav on mobile, incl. gesture-nav safe area
          paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
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
      {/* Chat panel — right side drawer */}
      <ChatPanel />
    </div>
  );
}
