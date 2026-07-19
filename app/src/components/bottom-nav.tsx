"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        const showBadge = tab.href === "/pager" && pagerUnread > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative flex min-w-13 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition-transform duration-150 active:scale-[0.90]",
              active ? "text-accent-ui-foreground" : "text-muted-foreground"
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
            <span className="text-xs font-medium">{tab.label}</span>
          </Link>
        );
      })}
      {/* "More" — opens mobile sidebar */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="flex min-w-13 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-muted-foreground transition-transform duration-150 active:scale-[0.90]"
        aria-label="More"
      >
        <Menu size={22} strokeWidth={2} />
        <span className="text-xs font-medium">More</span>
      </button>
    </nav>
  );
}
