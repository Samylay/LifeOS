"use client";

import { useState, useCallback } from "react";
import { Zap, Menu, Check, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useTasks } from "@/lib/use-tasks";

export function TopBar() {
  const { sidebarExpanded, setMobileSidebarOpen, toggleChatPanel } = useAppStore();
  const { createTask } = useTasks();
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(false);

  const handleCapture = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    await createTask({
      title: text,
      priority: "medium",
      status: "todo",
    });

    setInput("");
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
  }, [input, createTask]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCapture();
    }
  };

  return (
    <header
      className="sticky top-0 flex h-14 items-center gap-2 lg:gap-4 px-3 lg:px-6"
      style={{
        zIndex: "var(--z-header)",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-primary)",
        transition: `margin-left var(--duration-slow)`,
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
        className="lg:hidden rounded-lg p-2 transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        <Menu size={20} />
      </button>

      {/* Quick Capture */}
      <div className="flex flex-1 items-center gap-2">
        <div
          className="flex flex-1 max-w-xl items-center gap-2 rounded-xl px-4 py-2 transition-all"
          style={{
            background: "var(--bg-tertiary)",
            border: flash ? "1px solid var(--accent)" : "1px solid var(--border-primary)",
            boxShadow: flash ? "var(--shadow-glow)" : "none",
          }}
        >
          {flash ? (
            <Check size={16} style={{ color: "var(--accent)" }} />
          ) : (
            <Zap size={16} style={{ color: "var(--accent)" }} />
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Capture anything... (Enter to save as task)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Chat panel toggle */}
        <button
          onClick={toggleChatPanel}
          className="rounded-lg p-2 transition-colors"
          style={{ color: "var(--text-secondary)" }}
          title="Open Assistant"
        >
          <Sparkles size={20} />
        </button>
      </div>
    </header>
  );
}
