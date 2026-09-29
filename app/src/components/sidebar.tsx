"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNotifications } from "@/lib/use-notifications";
import { NAV_ITEMS, activeDestination } from "@/lib/navigation";
import {
  Sidebar as MiraSidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuBadge, SidebarTrigger, useSidebar,
} from "@/components/ui/mira/sidebar";

export function Sidebar() {
  const pathname = usePathname();
  const active = activeDestination(pathname)?.href;
  const activeIndex = NAV_ITEMS.findIndex((item) => item.href === active);
  const { state, isMobile } = useSidebar();
  const { messages } = useNotifications();
  const unread = messages.filter((m) => !m.readAt).length;
  if (isMobile) return null;

  return (
    <MiraSidebar collapsible="icon" variant="inset">
      <SidebarHeader className="justify-center px-2 py-3">
        <Link href="/" aria-label="LifeOS today"
          className="flex items-center gap-2.5 rounded-md p-2 pressable active:scale-[0.97]">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">L</span>
          {(state === "expanded" || isMobile) && <span className="text-base font-semibold tracking-tight">LifeOS</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation">
          <SidebarMenu className="relative px-2 py-1">
              {activeIndex >= 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute start-0.5 top-0 z-10 h-9 w-0.5 rounded-full bg-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-in-out-custom)]"
                  style={{ transform: `translateY(${activeIndex * 37}px)` }}
                />
              )}
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} isActive={active === item.href}
                    aria-current={active === item.href ? "page" : undefined}
                    aria-label={item.label} tooltip={state === "collapsed" ? item.label : undefined}>
                    <HugeiconsIcon icon={item.icon} strokeWidth={1.7} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.href === "/status" && unread > 0 && <SidebarMenuBadge aria-label={`${unread} unread alerts`}>{unread}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border">
        <div className="hidden items-center gap-2 px-1 lg:flex">
          <SidebarTrigger aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"} />
          {state === "expanded" && <span className="text-xs text-muted-foreground">Collapse <kbd className="ml-10 text-[10px]">Ctrl B</kbd></span>}
        </div>
      </SidebarFooter>
    </MiraSidebar>
  );
}
