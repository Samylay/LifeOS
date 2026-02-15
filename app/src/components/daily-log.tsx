"use client";

import { useState } from "react";
import { Sun, Moon, Zap, Smile } from "lucide-react";
import type { DailyLog } from "@/lib/types";

interface RatingPickerProps {
  label: string;
  icon: typeof Sun;
  value: number | undefined;
  onChange: (val: number) => void;
  color?: string;
}

function RatingPicker({ label, icon: Icon, value, onChange, color = "var(--accent)" }: RatingPickerProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-mono font-semibold transition-all"
            style={{
              background: value === n ? color : "var(--bg-tertiary)",
              color: value === n ? "white" : "var(--text-secondary)",
              transform: value === n ? "scale(1.1)" : "scale(1)",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MorningCheckInProps {
  log: DailyLog;
  onUpdate: (data: Partial<DailyLog>) => void;
}

export function MorningCheckIn({ log, onUpdate }: MorningCheckInProps) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Sun size={20} style={{ color: "#F59E0B" }} />
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Morning Check-in
        </h2>
      </div>
      <div className="space-y-4">
        <RatingPicker
          label="Sleep Quality"
          icon={Moon}
          value={log.sleepQuality}
          onChange={(val) => onUpdate({ sleepQuality: val })}
          color="#6366F1"
        />
        <RatingPicker
          label="Energy Level"
          icon={Zap}
          value={log.energy}
          onChange={(val) => onUpdate({ energy: val })}
          color="#10B981"
        />
        <RatingPicker
          label="Mood"
          icon={Smile}
          value={log.mood}
          onChange={(val) => onUpdate({ mood: val })}
          color="#F59E0B"
        />
      </div>
    </div>
  );
}

interface EveningReflectionProps {
  log: DailyLog;
  onUpdate: (data: Partial<DailyLog>) => void;
}

export function EveningReflection({ log, onUpdate }: EveningReflectionProps) {
  const [gratitude, setGratitude] = useState(log.gratitude || "");
  const [reflection, setReflection] = useState(log.reflection || "");

  const save = (field: "gratitude" | "reflection", value: string) => {
    onUpdate({ [field]: value });
  };

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Moon size={20} style={{ color: "#6366F1" }} />
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Evening Reflection
        </h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
            What are you grateful for today?
          </label>
          <textarea
            value={gratitude}
            onChange={(e) => setGratitude(e.target.value)}
            onBlur={() => save("gratitude", gratitude)}
            placeholder="Three things I'm grateful for..."
            rows={3}
            className="w-full rounded-lg p-3 text-sm outline-none resize-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
            How did the day go? What could be better?
          </label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            onBlur={() => save("reflection", reflection)}
            placeholder="Reflect on your day..."
            rows={3}
            className="w-full rounded-lg p-3 text-sm outline-none resize-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
