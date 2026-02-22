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
  ShoppingCart,
  Sparkles,
  X,
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
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();
  const {
    sidebarExpanded,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    toggleChatPanel,
  } = useAppStore();

  const expanded = mobile ? true : sidebarExpanded;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleNavClick = () => {
    if (mobile) setMobileSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 39 }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className="fixed left-0 top-0 flex h-screen flex-col border-r transition-all"
        style={{
          width: mobile ? 280 : sidebarExpanded ? 256 : 64,
          borderColor: "var(--border-primary)",
          background: "var(--bg-secondary)",
          transitionDuration: "var(--duration-slow)",
          zIndex: 40,
          transform: mobile
            ? mobileSidebarOpen
              ? "translateX(0)"
              : "translateX(-100%)"
            : undefined,
        }}
      >
        {/* Logo */}
        <div
          className="flex h-14 items-center justify-between px-4"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-3">
            {expanded && (
              <span
                className="font-semibold text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                Stride
              </span>
            )}
            {!expanded && (
              <span
                className="font-semibold text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                S
              </span>
            )}
          </div>
          {mobile && (
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="rounded-lg p-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X size={20} />
            </button>
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
                onClick={handleNavClick}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-bg)" : "transparent",
                  borderLeft: active
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                  transitionDuration: "var(--duration-fast)",
                }}
                title={!expanded ? item.label : undefined}
              >
                <Icon size={20} className="shrink-0" />
                {expanded && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Assistant button — opens chat panel */}
          <button
            onClick={() => {
              toggleChatPanel();
              if (mobile) setMobileSidebarOpen(false);
            }}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              borderLeft: "3px solid transparent",
              transitionDuration: "var(--duration-fast)",
            }}
            title={!expanded ? "Assistant" : undefined}
          >
            <Sparkles size={20} className="shrink-0" />
            {expanded && <span>Assistant</span>}
          </button>

          <div className="flex-1" />

          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-bg)" : "transparent",
                  borderLeft: active
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                  transitionDuration: "var(--duration-fast)",
                }}
                title={!expanded ? item.label : undefined}
              >
                <Icon size={20} className="shrink-0" />
                {expanded && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Collapse toggle — desktop only */}
          {!mobile && (
            <button
              onClick={toggleSidebar}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: "var(--text-tertiary)",
                transitionDuration: "var(--duration-fast)",
              }}
            >
              {sidebarExpanded ? (
                <ChevronsLeft size={20} />
              ) : (
                <ChevronsRight size={20} />
              )}
              {sidebarExpanded && <span>Collapse</span>}
            </button>
          )}
        </nav>
      </aside>
    </>
  );
}
