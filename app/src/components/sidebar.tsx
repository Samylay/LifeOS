"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { useAppStore } from "@/lib/store";
import { useNotifications } from "@/lib/use-notifications";
import { NAV_GROUPS, NAV_UTILITIES, activeDestination } from "@/lib/navigation";
import {
  Sidebar as MiraSidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuBadge, SidebarTrigger, useSidebar,
} from "@/components/ui/mira/sidebar";

export function Sidebar() {
  const pathname = usePathname();
  const active = activeDestination(pathname)?.href;
  const { setOpenMobile, state, isMobile } = useSidebar();
  const { setChatPanelOpen } = useAppStore();
  const { messages } = useNotifications();
  const unread = messages.filter((m) => !m.readAt).length;
  const navigate = () => setOpenMobile(false);

  const links = (items: typeof NAV_UTILITIES) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton render={<Link href={item.href} />} isActive={active === item.href}
            aria-current={active === item.href ? "page" : undefined}
            aria-label={item.label} tooltip={state === "collapsed" && !isMobile ? item.label : undefined} onClick={navigate}>
            <HugeiconsIcon icon={item.icon} strokeWidth={1.7} />
            <span>{item.label}</span>
          </SidebarMenuButton>
          {item.href === "/status" && unread > 0 && <SidebarMenuBadge aria-label={`${unread} unread alerts`}>{unread}</SidebarMenuBadge>}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <MiraSidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-16 justify-center px-2">
        <Link href="/" onClick={navigate} aria-label="LifeOS today"
          className="flex items-center gap-2.5 rounded-md p-2 pressable active:scale-[0.97]">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">L</span>
          {(state === "expanded" || isMobile) && <span className="text-base font-semibold tracking-tight">LifeOS</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="h-6 text-[11px] font-medium text-muted-foreground">{group.label}</SidebarGroupLabel>
              {links(group.items)}
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border">
        <nav aria-label="Utilities">{links(NAV_UTILITIES)}</nav>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton aria-label="Open assistant" tooltip={state === "collapsed" && !isMobile ? "Assistant" : undefined} onClick={() => { navigate(); setChatPanelOpen(true); }}>
              <HugeiconsIcon icon={SparklesIcon} strokeWidth={1.7} /><span>Assistant</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="hidden items-center gap-2 px-1 lg:flex">
          <SidebarTrigger aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"} />
          {state === "expanded" && <span className="text-xs text-muted-foreground">Collapse <kbd className="ml-10 text-[10px]">Ctrl B</kbd></span>}
        </div>
      </SidebarFooter>
    </MiraSidebar>
  );
}
