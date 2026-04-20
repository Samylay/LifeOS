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
  Mountain,
  Target,
  Inbox,
  BarChart2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";

const NAV_GROUPS = [
  {
    label: "Plan & Do",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/focus", label: "Focus", icon: Timer },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/journeys", label: "Journeys", icon: Mountain },
      { href: "/quests", label: "Quests", icon: Target },
      { href: "/goals", label: "Goals", icon: Flag },
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Life Areas",
    items: [
      { href: "/areas", label: "Areas", icon: Layers },
      { href: "/workouts", label: "Workouts", icon: Dumbbell },
      { href: "/reading", label: "Reading", icon: BookMarked },
      { href: "/shopping", label: "Shopping", icon: ShoppingCart },
      { href: "/reminders", label: "Reminders", icon: Bell },
      { href: "/calendar", label: "Calendar", icon: Calendar },
    ],
  },
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
        className="fixed left-0 top-0 flex h-screen flex-col border-r transition-all overflow-y-auto overflow-x-hidden"
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
          className="flex h-14 items-center justify-between px-4 shrink-0"
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
                className="font-semibold text-lg text-center w-8"
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
        <nav className="flex flex-1 flex-col gap-6 px-2 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              {expanded && (
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] mb-2 opacity-40 text-primary">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className="group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
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
                    <Icon size={18} className="shrink-0" />
                    {expanded && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Assistant button — opens chat panel */}
          <div className="space-y-1">
            {expanded && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] mb-2 opacity-40 text-primary">
                AI Assistant
              </p>
            )}
            <button
              onClick={() => {
                toggleChatPanel();
                if (mobile) setMobileSidebarOpen(false);
              }}
              className="group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors w-full text-left"
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
                borderLeft: "3px solid transparent",
                transitionDuration: "var(--duration-fast)",
              }}
              title={!expanded ? "Assistant" : undefined}
            >
              <Sparkles size={18} className="shrink-0 text-sage-500" />
              {expanded && <span>Chat with Stride</span>}
            </button>
          </div>

          <div className="flex-1" />

          <div className="pt-4 border-t border-primary mt-auto">
            {BOTTOM_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors mb-1"
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
                  <Icon size={18} className="shrink-0" />
                  {expanded && <span>{item.label}</span>}
                </Link>
              );
            })}

            {/* Collapse toggle — desktop only */}
            {!mobile && (
              <button
                onClick={toggleSidebar}
                className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors w-full text-left"
                style={{
                  color: "var(--text-tertiary)",
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                {sidebarExpanded ? (
                  <ChevronsLeft size={18} />
                ) : (
                  <ChevronsRight size={18} />
                )}
                {sidebarExpanded && <span>Collapse Sidebar</span>}
              </button>
            )}
          </div>
        </nav>
      </aside>
    </>
  );
}
