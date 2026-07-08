"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  FolderKanban,
  Flag,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  Bell,
  Sparkles,
  X,
  Inbox,
  UtensilsCrossed,
  Activity,
  Brain,
  PenSquare,
  ExternalLink,
  Gauge,
  Sunrise,
  Coffee,
  GraduationCap,
  Clapperboard,
  BellRing,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";

// Flux (content engine) is a sibling app on the tailnet. Baked at build time;
// override with NEXT_PUBLIC_FLUX_URL.
const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || "http://homelab.tail069527.ts.net";

const NAV_GROUPS = [
  {
    label: "Plan & Do",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/brief", label: "Morning Brief", icon: Coffee },
      { href: "/prime", label: "Daily Prime", icon: Sunrise },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/goals", label: "Goals", icon: Flag },
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Life Areas",
    items: [
      { href: "/areas", label: "Areas", icon: Layers },
      { href: "/workouts", label: "Workouts", icon: Dumbbell },
      { href: "/strength", label: "Strength", icon: Activity },
      { href: "/food", label: "Food", icon: UtensilsCrossed },
      { href: "/reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    label: "Learn & Build",
    items: [
      { href: "/things-to-learn", label: "Things to Learn", icon: GraduationCap },
    ],
  },
  {
    label: "Knowledge & Content",
    items: [
      { href: "/knowledge", label: "Knowledge", icon: Brain },
      { href: "/content", label: "Content OS", icon: Clapperboard },
      { href: FLUX_URL, label: "Content (Flux)", icon: PenSquare, external: true },
    ],
  },
];

const BOTTOM_ITEMS = [
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
                const external = "external" in item && item.external;
                const active = !external && isActive(item.href);
                const className =
                  "group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";
                const style = {
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-bg)" : "transparent",
                  borderLeft: active
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                  transitionDuration: "var(--duration-fast)",
                };
                if (external) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={handleNavClick}
                      className={className}
                      style={style}
                      title={!expanded ? item.label : undefined}
                    >
                      <Icon size={18} className="shrink-0" />
                      {expanded && (
                        <span className="truncate flex-1 flex items-center gap-1">
                          {item.label}
                          <ExternalLink size={12} className="opacity-50" />
                        </span>
                      )}
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={className}
                    style={style}
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
