"use client";

import { Menu, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";

export function TopBar() {
  const { sidebarExpanded, setMobileSidebarOpen, toggleChatPanel } = useAppStore();

  return (
    <header
      className="sticky top-0 flex h-14 items-center gap-2 lg:gap-4 px-3 lg:px-6"
      style={{
        zIndex: "var(--z-header)",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-primary)",
      }}
    >
      <style>{`
        @media (min-width: 1024px) {
          header { margin-left: ${sidebarExpanded ? 256 : 64}px; }
        }
      `}</style>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden rounded-lg p-2 transition-transform duration-150 active:scale-[0.92]"
        style={{ color: "var(--text-secondary)" }}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <span className="lg:hidden font-semibold" style={{ color: "var(--text-primary)" }}>
        LifeOS
      </span>

      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Chat panel toggle */}
        <button
          onClick={toggleChatPanel}
          className="rounded-lg p-2 transition-transform duration-150 active:scale-[0.92]"
          style={{ color: "var(--text-secondary)" }}
          title="Open Assistant"
          aria-label="Open assistant"
        >
          <Sparkles size={20} />
        </button>
      </div>
    </header>
  );
}
