"use client";

import { useState, useCallback } from "react";
import { Zap, Check } from "lucide-react";
import { useTasks } from "@/lib/use-tasks";

export default function CapturePage() {
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Quick Capture
      </h1>

      <div
        className="rounded-xl p-6"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 transition-all"
          style={{
            background: "var(--bg-tertiary)",
            border: flash ? "1px solid var(--accent)" : "1px solid var(--border-primary)",
            boxShadow: flash ? "var(--shadow-glow)" : "none",
          }}
        >
          {flash ? (
            <Check size={20} style={{ color: "var(--accent)" }} />
          ) : (
            <Zap size={20} style={{ color: "var(--accent)" }} />
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type anything — task, event, note, reminder... (Enter to save)"
            className="flex-1 bg-transparent text-base outline-none"
            style={{ color: "var(--text-primary)" }}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Examples:
          </p>
          <ul className="space-y-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            <li>&quot;Meet Thomas at 3pm Friday&quot; → Calendar event</li>
            <li>&quot;Look into Garmin Connect API this weekend&quot; → Task tagged Learning</li>
            <li>&quot;Cancel Amazon Prime&quot; → Task tagged Life-Admin, flagged urgent</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
