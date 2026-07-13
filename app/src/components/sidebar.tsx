"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Flag,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  Sparkles,
  X,
  Brain,
  Gauge,
  Clapperboard,
  BellRing,
  Layers,
  Radar,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";

// Primary destinations (IA restructure 2026-07-10: 6 core + 3 footer;
// /decide added 2026-07-11 — the swipeable decision deck, Samy's ask).
const NAV_ITEMS = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/decide", label: "Decide", icon: Layers },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/content", label: "Content", icon: Clapperboard },
  { href: "/workouts", label: "Training", icon: Dumbbell },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
];

const BOTTOM_ITEMS = [
  { href: "/leads", label: "Leads", icon: Radar },
  { href: "/pager", label: "Pager", icon: BellRing },
  { href: "/status", label: "Status", icon: Gauge },
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
  const { messages } = useNotifications();
  const pagerUnread = messages.filter((m) => !m.readAt).length;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleNavClick = () => {
    if (mobile) setMobileSidebarOpen(false);
  };

  useEffect(() => {
    if (!mobile || !mobileSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobile, mobileSidebarOpen, setMobileSidebarOpen]);

  const linkClass =
    "group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-[color,background,transform] duration-150 active:scale-[0.97]";

  return (
    <>
      {/* Mobile overlay */}
      {mobile && mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 39 }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className="fixed left-0 top-0 flex h-screen flex-col border-r overflow-y-auto overflow-x-hidden"
        style={{
          width: mobile ? 280 : sidebarExpanded ? 256 : 64,
          borderColor: "var(--border-primary)",
          background: "var(--bg-secondary)",
          transition: "transform var(--dur-slow) var(--ease-drawer)",
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
          <span
            className={`font-semibold text-lg ${expanded ? "" : "text-center w-8"}`}
            style={{ color: "var(--text-primary)" }}
          >
            {expanded ? "LifeOS" : "L"}
          </span>
          {mobile && (
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="rounded-lg p-1.5 transition-transform duration-150 active:scale-[0.92]"
              style={{ color: "var(--text-tertiary)" }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-2 px-2 py-6">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={linkClass}
                  style={{
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    background: active ? "var(--accent-bg)" : "transparent",
                    borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {expanded && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Assistant button — opens chat panel */}
          <button
            onClick={() => {
              toggleChatPanel();
              if (mobile) setMobileSidebarOpen(false);
            }}
            className={`${linkClass} w-full text-left mt-2`}
            style={{ color: "var(--text-secondary)", borderLeft: "3px solid transparent" }}
            title={!expanded ? "Assistant" : undefined}
          >
            <Sparkles size={18} className="shrink-0 text-sage-500" />
            {expanded && <span>Assistant</span>}
          </button>

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
                  className={`${linkClass} mb-1`}
                  style={{
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    background: active ? "var(--accent-bg)" : "transparent",
                    borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {expanded && <span className="flex-1">{item.label}</span>}
                  {item.href === "/pager" && pagerUnread > 0 && expanded && (
                    <span
                      className="text-xs font-semibold rounded-full px-2 py-0.5"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      {pagerUnread}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Collapse toggle — desktop only */}
            {!mobile && (
              <button
                onClick={toggleSidebar}
                className={`${linkClass} w-full text-left`}
                style={{ color: "var(--text-tertiary)" }}
                aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarExpanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
                {sidebarExpanded && <span>Collapse</span>}
              </button>
            )}
          </div>
        </nav>
      </aside>
    </>
  );
}
