"use client";

import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export function TopBar() {
  const { sidebarExpanded, setMobileSidebarOpen, toggleChatPanel } = useAppStore();

  return (
    <header
      className="sticky top-0 z-(--z-header) flex h-14 items-center gap-2 border-b border-border bg-card px-3 lg:gap-4 lg:px-6"
    >
      <style>{`
        @media (min-width: 1024px) {
          header { margin-left: ${sidebarExpanded ? 256 : 64}px; }
        }
      `}</style>
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

      <span className="lg:hidden font-semibold text-foreground">LifeOS</span>

      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Chat panel toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleChatPanel}
          className="text-muted-foreground active:scale-[0.92]"
          title="Open Assistant"
          aria-label="Open assistant"
        >
          <Sparkles size={20} />
        </Button>
      </div>
    </header>
  );
}
