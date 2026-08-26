"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  LayoutDashboard,
  BellRing,
  Clapperboard,
  FolderKanban,
  Layers,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";
import { NavIndicator } from "@/components/nav-indicator";

// /decide added 2026-07-11 (ux-audit H1): the decision deck is built for the
// phone — it can't live two taps deep behind "More". 6 items still fit 360px.
const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/decide", label: "Decide", icon: Layers },
  { href: "/pager", label: "Pager", icon: BellRing },
  { href: "/content", label: "Content", icon: Clapperboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

export function BottomNav() {
  const pathname = usePathname();
  const { setMobileSidebarOpen } = useAppStore();
  const { messages } = useNotifications();
  const pagerUnread = messages.filter((m) => !m.readAt).length;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // U5: sliding active pill across the tabs (transform only). -1 when the
  // active route isn't a tab — the indicator is simply not rendered then.
  const tabListRef = useRef<HTMLElement>(null);
  const activeIndex = TABS.findIndex((t) => isActive(t.href));

  return (
    <nav
      ref={tabListRef}
      className="glass-panel fixed bottom-0 left-0 right-0 z-40 flex h-[4.25rem] items-center justify-around border-x-0 border-b-0 px-1 pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      aria-label="Primary"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        const showBadge = tab.href === "/pager" && pagerUnread > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative z-10 flex min-w-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 pressable active:scale-[0.92]",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {showBadge && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {pagerUnread}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </Link>
        );
      })}
      {/* "More" — opens mobile sidebar */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="relative z-10 flex min-w-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-muted-foreground pressable active:scale-[0.92]"
        aria-label="More"
      >
        <Menu size={22} strokeWidth={2} />
        <span className="text-[10px] font-semibold">More</span>
      </button>
      {/* U5 sliding pill — rendered after the tabs so it doesn't shift the
          container.children indices the indicator measures; -z-10 keeps it
          behind the tab content. */}
      {activeIndex >= 0 && (
        <NavIndicator
          containerRef={tabListRef}
          activeIndex={activeIndex}
          orientation="horizontal"
          className=""
        />
      )}
    </nav>
  );
}
