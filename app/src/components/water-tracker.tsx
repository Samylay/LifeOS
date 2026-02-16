"use client";

import { Droplets, Plus, Minus } from "lucide-react";
import { useWater } from "@/lib/use-water";

export function WaterTracker({ compact = false }: { compact?: boolean }) {
  const { log, addGlass, removeGlass, percentage } = useWater();

  const filled = log.glasses;
  const goal = log.goal;

  if (compact) {
    return (
      <button
        onClick={addGlass}
        className="flex items-center gap-2 rounded-xl px-4 py-3 transition-all active:scale-95"
        style={{
          background: "var(--bg-secondary)",
          border: percentage >= 100 ? "1px solid #06B6D4" : "1px solid var(--border-primary)",
        }}
      >
        <Droplets size={20} style={{ color: "#06B6D4" }} />
        <div className="flex-1 text-left">
          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            Water
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {filled}/{goal} glasses
          </p>
        </div>
        <span className="text-sm font-mono font-bold" style={{ color: "#06B6D4" }}>
          {percentage}%
        </span>
      </button>
    );
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Droplets size={20} style={{ color: "#06B6D4" }} />
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Water Intake
        </h3>
      </div>

      {/* Visual glasses */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <button
          onClick={removeGlass}
          className="rounded-full p-2 transition-colors"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
          }}
        >
          <Minus size={16} />
        </button>

        <div className="flex flex-wrap justify-center gap-1.5 px-2">
          {Array.from({ length: goal }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-5 rounded-b-lg rounded-t-sm transition-all"
              style={{
                background: i < filled ? "#06B6D4" : "var(--bg-tertiary)",
                border: i < filled ? "1px solid #06B6D4" : "1px solid var(--border-primary)",
                opacity: i < filled ? 1 : 0.4,
              }}
            />
          ))}
        </div>

        <button
          onClick={addGlass}
          className="rounded-full p-2 transition-colors"
          style={{
            background: "#06B6D420",
            color: "#06B6D4",
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="text-center">
        <span className="text-2xl font-bold font-mono" style={{ color: "#06B6D4" }}>
          {filled}
        </span>
        <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {" "}/ {goal} glasses
        </span>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          {filled * 250}ml / {goal * 250}ml
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 rounded-full overflow-hidden mt-3"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            background: percentage >= 100 ? "#10B981" : "#06B6D4",
          }}
        />
      </div>
    </div>
  );
}
