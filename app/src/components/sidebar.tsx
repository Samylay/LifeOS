"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  ChevronDown,
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
  Newspaper,
  Mic,
  GalleryVerticalEnd,
  CookingPot,
  SquareTerminal,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";
import { NavIndicator } from "@/components/nav-indicator";

// Nav diet (ux overhaul 2026-07-29): the sidebar had regrown to 16 flat rows
// against the documented 6+3 budget. Primary = the surfaces that answer
// "what now?" (mirrors the bottom nav). Everything you seek deliberately
// lives behind "More"; utilities stay in the footer. /diagrams left the nav
// on purpose — it is a tool reached from chat or by URL, not a place.
const NAV_ITEMS = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/decide", label: "Decide", icon: Layers },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/content", label: "Content", icon: Clapperboard },
  { href: "/pager", label: "Pager", icon: BellRing },
];

const MORE_ITEMS = [
  { href: "/voice", label: "Voice", icon: Mic },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
  { href: "/feed", label: "Feed", icon: GalleryVerticalEnd },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/workouts", label: "Training", icon: Dumbbell },
  { href: "/recipes", label: "Recipes", icon: CookingPot },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/leads", label: "Leads", icon: Radar },
];

const BOTTOM_ITEMS = [
  { href: "/status", label: "Status", icon: Gauge },
  { href: "/terminal", label: "Terminal", icon: SquareTerminal },
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

  // U5: sliding active pill across the primary items (transform only).
  // -1 when the active route lives outside the primary group — the indicator
  // is simply not rendered then.
  const primaryListRef = useRef<HTMLDivElement>(null);
  const primaryActiveIndex = NAV_ITEMS.findIndex((i) => isActive(i.href));

  // "More" starts open on mobile (the bottom nav's More button exists to reach
  // these) and whenever the active route lives inside the group.
  const [moreOpen, setMoreOpen] = useState(
    () => Boolean(mobile) || MORE_ITEMS.some((i) => isActive(i.href))
  );
  // Client-side nav into a More route must also reveal the active item.
  const inMoreGroup = MORE_ITEMS.some((i) => isActive(i.href));
  useEffect(() => {
    if (inMoreGroup) setMoreOpen(true);
  }, [inMoreGroup]);

  const handleNavClick = () => {
    if (mobile) setMobileSidebarOpen(false);
  };

  // Lock body scroll while the mobile drawer is open, otherwise a swipe on the
  // drawer scrolls the page behind it instead of the nav list.
  useEffect(() => {
    if (!mobile || !mobileSidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobile, mobileSidebarOpen]);

  useEffect(() => {
    if (!mobile || !mobileSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobile, mobileSidebarOpen, setMobileSidebarOpen]);

  const linkClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-1.5 text-sm font-medium transition-[color,background,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]",
      active
        ? "border-l-primary bg-accent text-accent-foreground"
        : "border-l-transparent text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
    );

  return (
    <>
      {/* Mobile overlay */}
      {mobile && mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[39] bg-black/40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className="fixed left-0 top-0 z-40 flex flex-col overflow-hidden border-r border-border bg-card"
        style={{
          height: "100dvh",
          width: mobile ? 280 : sidebarExpanded ? 256 : 64,
          transition: "transform var(--dur-slow) var(--ease-drawer)",
          transform: mobile
            ? mobileSidebarOpen
              ? "translateX(0)"
              : "translateX(-100%)"
            : undefined,
        }}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <span
            className={cn(
              "text-lg font-semibold text-foreground",
              expanded ? "" : "w-8 text-center"
            )}
          >
            {expanded ? "LifeOS" : "L"}
          </span>
          {mobile && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileSidebarOpen(false)}
              className="text-muted-foreground active:scale-[0.92]"
              aria-label="Close menu"
            >
              <X size={20} />
            </Button>
          )}
        </div>

        {/* Nav items */}
        <nav
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-6"
          style={{ overscrollBehavior: "contain", touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          <div ref={primaryListRef} className="relative space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={linkClass(active)}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {expanded && <span className="flex-1 truncate">{item.label}</span>}
                  {item.href === "/pager" && pagerUnread > 0 && expanded && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      {pagerUnread}
                    </span>
                  )}
                </Link>
              );
            })}
            {/* U5 sliding pill — rendered after the items so it doesn't shift
                the container.children indices the indicator measures; -z-10
                keeps it behind the link content. */}
            {primaryActiveIndex >= 0 && (
              <NavIndicator
                containerRef={primaryListRef}
                activeIndex={primaryActiveIndex}
                orientation="vertical"
                className="-z-10"
              />
            )}
          </div>

          {/* Assistant button — opens chat panel */}
          <button
            onClick={() => {
              toggleChatPanel();
              if (mobile) setMobileSidebarOpen(false);
            }}
            className={cn(linkClass(false), "mt-2 w-full text-left")}
            title={!expanded ? "Assistant" : undefined}
          >
            <Sparkles size={18} className="shrink-0 text-primary" />
            {expanded && <span>Assistant</span>}
          </button>

          {/* Secondary destinations — deliberate visits, one level down */}
          <div className="mt-2">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(linkClass(false), "w-full text-left")}
              aria-expanded={moreOpen}
              title={!expanded ? "More" : undefined}
            >
              <ChevronDown
                size={18}
                className="shrink-0 pressable"
                style={{ transform: moreOpen ? undefined : "rotate(-90deg)" }}
              />
              {expanded && <span>More</span>}
            </button>
            {moreOpen && (
              <div className="mt-1 space-y-1">
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleNavClick}
                      className={linkClass(active)}
                      title={!expanded ? item.label : undefined}
                    >
                      <Icon size={18} className="shrink-0" />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <div className="mt-auto border-t border-border pt-4">
            {BOTTOM_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(linkClass(active), "mb-1")}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {expanded && <span className="flex-1">{item.label}</span>}
                </Link>
              );
            })}

            {/* Collapse toggle — desktop only */}
            {!mobile && (
              <button
                onClick={toggleSidebar}
                className={cn(linkClass(false), "w-full text-left")}
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
