"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BellRing,
  Clapperboard,
  FolderKanban,
  Menu,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";

const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
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
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around lg:hidden"
      style={{
        height: 64,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-primary)",
        zIndex: 40,
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        const showBadge = tab.href === "/pager" && pagerUnread > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-transform duration-150 active:scale-[0.90]"
            style={{
              color: active ? "var(--accent)" : "var(--text-tertiary)",
              minWidth: 56,
            }}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {showBadge && (
                <span
                  className="absolute -top-1.5 -right-2 text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {pagerUnread}
                </span>
              )}
            </div>
            <span className="font-medium" style={{ fontSize: 12 }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
      {/* "More" — opens mobile sidebar */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-transform duration-150 active:scale-[0.90]"
        style={{ color: "var(--text-tertiary)", minWidth: 56 }}
        aria-label="More"
      >
        <Menu size={22} strokeWidth={2} />
        <span className="font-medium" style={{ fontSize: 12 }}>
          More
        </span>
      </button>
    </nav>
  );
}
