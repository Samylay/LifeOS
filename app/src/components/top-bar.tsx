"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon, Activity01Icon, Chat01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { surfaceTitle } from "@/lib/navigation";

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="app-topbar sticky top-0 z-(--z-header) flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md lg:px-7">
      <span className="truncate text-sm font-medium">{surfaceTitle(pathname)}</span>
      <div className="flex-1" />
      <Link href="/status" aria-label="System" title="System" className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-transform duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground active:scale-[0.97] lg:hidden">
        <HugeiconsIcon icon={Activity01Icon} size={18} />
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
