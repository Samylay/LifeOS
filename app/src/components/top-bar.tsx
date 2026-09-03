"use client";

import { Menu, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

const ROUTE_TITLES: Array<[string, string]> = [
  ["/decide/approvals", "Approvals"],
  ["/decide/dispatch", "Send to Claude"],
  ["/decide", "Decide"],
  ["/projects", "Projects"],
  ["/content", "Content"],
  ["/pager", "Pager"],
  ["/voice", "Voice"],
  ["/knowledge", "Knowledge"],
  ["/feed", "Feed"],
  ["/news", "News"],
  ["/workouts", "Training"],
  ["/recipes", "Recipes"],
  ["/finance", "Finance"],
  ["/leads", "Leads"],
  ["/status", "Status"],
  ["/terminal", "Terminal"],
  ["/settings", "Settings"],
  ["/prime", "Prime"],
  ["/diagrams", "Diagrams"],
];

export function TopBar() {
  const pathname = usePathname();
  const { setMobileSidebarOpen, toggleChatPanel } = useAppStore();
  const surface = ROUTE_TITLES.find(([path]) => pathname.startsWith(path))?.[1] ?? "Today";

  return (
    <header
      className="app-topbar glass-panel sticky top-0 z-(--z-header) flex h-14 items-center gap-2 border-x-0 border-t-0 px-3 lg:gap-4 lg:px-6"
    >
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden text-muted-foreground active:scale-[0.92]"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </Button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:inline">
          LifeOS
        </span>
        <span className="hidden text-border lg:inline">/</span>
        <span className="truncate text-sm font-semibold text-foreground">{surface}</span>
      </div>

      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Chat panel toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleChatPanel}
          className="gap-2 text-primary hover:bg-secondary hover:text-primary active:scale-[0.97]"
          title="Open Assistant"
          aria-label="Open assistant"
        >
          <Sparkles size={17} />
          <span className="hidden sm:inline">Assistant</span>
        </Button>
      </div>
    </header>
  );
}
