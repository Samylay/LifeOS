"use client";

import { useState, useCallback } from "react";
import { Zap, Bell, Menu, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useTasks } from "@/lib/use-tasks";

export function TopBar() {
  const { sidebarExpanded, toggleSidebar } = useAppStore();
  const { user, signOut } = useAuth();
  const { createTask } = useTasks();
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(false);

  const handleCapture = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Basic parsing: for now, create a task. LLM upgrade later (Phase 4).
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
      className="sticky top-0 flex h-14 items-center gap-4 px-6"
      style={{
        zIndex: "var(--z-header)",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-primary)",
        marginLeft: sidebarExpanded ? 256 : 64,
        transition: `margin-left var(--duration-slow)`,
      }}
    >
      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
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
      <div className="flex items-center gap-3">
        <button
          className="rounded-lg p-2 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <Bell size={20} />
        </button>

        {user && (
          <button
            onClick={signOut}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-semibold"
            title={user.displayName || "Sign out"}
          >
            {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
          </button>
        )}
      </div>
    </header>
  );
}
