"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Zap, Bell, Menu, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useTasks } from "@/lib/use-tasks";
import { VoiceCommandButton } from "@/components/voice-command-button";

export function TopBar() {
  const { sidebarExpanded, toggleSidebar } = useAppStore();
  const { user, signOut } = useAuth();
  const { tasks, createTask, updateTask, deleteTask } = useTasks();
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        <VoiceCommandButton
          tasks={tasks}
          onDelete={deleteTask}
          onUpdate={updateTask}
          onCreate={createTask}
          compact
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className="rounded-lg p-2 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <Bell size={20} />
          </button>
          {notifOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-72 rounded-xl p-4 shadow-lg"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                zIndex: 50,
              }}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Notifications
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                No notifications yet. Reminders and alerts will show up here.
              </p>
            </div>
          )}
        </div>

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
