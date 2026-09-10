"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, SparklesIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/mira/sidebar";
import { useAppStore } from "@/lib/store";
import { surfaceTitle } from "@/lib/navigation";

export function TopBar() {
  const pathname = usePathname();
  const { chatPanelOpen, toggleChatPanel } = useAppStore();
  return (
    <header className="app-topbar sticky top-0 z-(--z-header) flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md lg:px-7">
      <SidebarTrigger className="lg:hidden" aria-label="Open navigation" />
      <Link href="/" className="hidden text-sm text-muted-foreground hover:text-foreground lg:inline">Workspace</Link>
      <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="hidden text-muted-foreground lg:block" />
      <span className="truncate text-sm font-medium">{surfaceTitle(pathname)}</span>
      <div className="flex-1" />
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/voice/capture"><HugeiconsIcon icon={Mic01Icon} size={16} />Capture</Link></Button>
      <Button variant="outline" size="sm" onClick={toggleChatPanel} aria-label={chatPanelOpen ? "Close assistant" : "Open assistant"} aria-expanded={chatPanelOpen}>
        <HugeiconsIcon icon={SparklesIcon} size={16} /><span className="hidden sm:inline">Assistant</span>
      </Button>
    </header>
  );
}
