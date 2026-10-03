"use client";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon, Activity01Icon, Chat01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/lib/use-notifications";

export function TopBar() {
  const { unreadCount } = useNotifications();
  return (
    <header className="app-topbar sticky top-0 z-(--z-header) flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md lg:px-7">
      {/* The page heading names the page; this bar only carries the shortcuts. */}
      <div className="flex-1" />
      <Link href="/status" aria-label={unreadCount > 0 ? `System, ${unreadCount} unread alerts` : "System"} title="System" className="relative grid size-11 place-items-center rounded-lg text-muted-foreground transition-transform duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground active:scale-[0.97] lg:hidden">
        <HugeiconsIcon icon={Activity01Icon} size={18} />
        {unreadCount > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground lg:hidden">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </Link>
      <Link href="/settings" aria-label="Settings" title="Settings" className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-transform duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground active:scale-[0.97] lg:hidden">
        <HugeiconsIcon icon={Settings01Icon} size={18} />
      </Link>
      <Button variant="outline" size="sm" render={<Link href="/chat" aria-label="Assistant" />}>
        <HugeiconsIcon icon={Chat01Icon} size={16} /><span className="hidden sm:inline">Assistant</span>
      </Button>
    </header>
  );
}
