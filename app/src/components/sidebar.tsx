"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Timer,
  Layers,
  FolderKanban,
  Flag,
  Calendar,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  Bell,
  BookMarked,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/lib/store";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/areas", label: "Areas", icon: Layers },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/reading", label: "Reading", icon: BookMarked },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarExpanded, toggleSidebar } = useAppStore();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="fixed left-0 top-0 z-[var(--z-sidebar)] flex h-screen flex-col border-r transition-all"
      style={{
        width: sidebarExpanded ? 256 : 64,
        borderColor: "var(--border-primary)",
        background: "var(--bg-secondary)",
        transitionDuration: "var(--duration-slow)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-14 items-center gap-3 px-4"
        style={{ borderBottom: "1px solid var(--border-primary)" }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 font-bold text-white text-sm">
          L
        </div>
        {sidebarExpanded && (
          <span className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
            LifeOS
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "var(--accent-bg)" : "transparent",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                transitionDuration: "var(--duration-fast)",
              }}
              title={!sidebarExpanded ? item.label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {sidebarExpanded && <span>{item.label}</span>}
            </Link>
          );
        })}

        <div className="flex-1" />

        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "var(--accent-bg)" : "transparent",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                transitionDuration: "var(--duration-fast)",
              }}
              title={!sidebarExpanded ? item.label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {sidebarExpanded && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{ color: "var(--text-tertiary)", transitionDuration: "var(--duration-fast)" }}
        >
          {sidebarExpanded ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
          {sidebarExpanded && <span>Collapse</span>}
        </button>
      </nav>
    </aside>
  );
}
