"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ScrollChrome } from "./scroll-chrome";
import { NotificationNavigation } from "./notification-navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { ChatPanel } from "./chat-panel";
import { useAppStore } from "@/lib/store";
import { SidebarProvider, SidebarInset } from "@/components/ui/mira/sidebar";
import { TooltipProvider } from "@/components/ui/mira/tooltip";

export function AppShell({ children }: { children: ReactNode }) {
  const isChat = usePathname() === "/chat";
  const { sidebarExpanded, setSidebarExpanded } = useAppStore();
  return (
    <TooltipProvider>
      <NotificationNavigation />
      <ScrollChrome />
      <SidebarProvider open={sidebarExpanded} onOpenChange={setSidebarExpanded}>
        <a href="#main-content" className="fixed left-3 top-3 z-(--z-focus-overlay) -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0">Skip to content</a>
        <Sidebar />
        <SidebarInset className="min-w-0 bg-background">
          {!isChat && <TopBar />}
          <main id="main-content" className={`app-main${isChat ? " app-main-chat" : ""}`} tabIndex={-1}>
            <div className="app-content">{children}</div>
          </main>
        </SidebarInset>
        <BottomNav />
        <ChatPanel />
      </SidebarProvider>
    </TooltipProvider>
  );
}
