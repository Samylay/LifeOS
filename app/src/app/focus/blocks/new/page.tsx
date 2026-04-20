"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useFocusBlocks } from "@/lib/use-focus-blocks";
import { useJourneys } from "@/lib/use-journeys";
import { AREAS, type AreaId } from "@/lib/types";

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export default function NewFocusBlockPage() {
  const router = useRouter();
  const { createBlock } = useFocusBlocks();
  const { activeJourneys } = useJourneys();

  const today = new Date().toISOString().split("T")[0];

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:30");
  const [sessionDuration, setSessionDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [area, setArea] = useState<AreaId | "">("");
  const [journeyId, setJourneyId] = useState("");
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [autoStart, setAutoStart] = useState(true);
  const [shieldEnabled, setShieldEnabled] = useState(true);

  const totalMinutes = diffMinutes(startTime, endTime);
  const sessionCount = useMemo(() => {
    const sd = sessionDuration + breakDuration;
    if (sd <= 0) return 0;
    // last session has no trailing break
    return Math.max(1, Math.floor((totalMinutes + breakDuration) / sd));
  }, [totalMinutes, sessionDuration, breakDuration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createBlock({
      title: title.trim(),
      goal: goal.trim() || undefined,
      date,
      startTime,
      endTime,
      sessionCount,
      sessionDuration,
      breakDuration,
      bufferMinutes,
      autoStart,
      shieldEnabled,
      area: area || undefined,
      journeyId: journeyId || undefined,
    });
    router.push("/focus/blocks");
  };

  return (
    <div className="max-w-2xl">
      <Link
        href="/focus/blocks"
        className="text-sm flex items-center gap-1 mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} /> Back to Blocks
      </Link>

      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        New block
      </h1>
      <p
        className="text-xs font-mono uppercase tracking-wider mb-6"
        style={{ color: "var(--text-tertiary)" }}
      >
        Pre-scheduled deep work
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <p
            className="text-xs font-mono uppercase tracking-wider mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Title
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deep work block"
            autoFocus
            required
            className="w-full bg-transparent text-base outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <p
            className="text-xs font-mono uppercase tracking-wider mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Goal
          </p>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What you'll finish in this block"
            className="w-full bg-transparent text-base outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <p
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Date
            </p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <p
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Start
            </p>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <p
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              End
            </p>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p
            className="text-xs font-mono uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Auto-sessions
          </p>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {sessionCount} × focus · {sessionDuration}m
            <span className="ml-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
              + {Math.max(0, sessionCount - 1)} × break · {breakDuration}m
            </span>
          </p>
          <div className="flex items-center gap-3 mt-3">
            <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              Focus
              <input
                type="number"
                min="5"
                max="120"
                value={sessionDuration}
                onChange={(e) => setSessionDuration(Math.max(5, Number(e.target.value) || 25))}
                className="w-16 text-xs rounded px-2 py-1 outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              />
              m
            </label>
            <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              Break
              <input
                type="number"
                min="0"
                max="60"
                value={breakDuration}
                onChange={(e) => setBreakDuration(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 text-xs rounded px-2 py-1 outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              />
              m
            </label>
            <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              Buffer
              <input
                type="number"
                min="0"
                max="60"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 text-xs rounded px-2 py-1 outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              />
              m
            </label>
          </div>
        </div>

        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
              Link to area
            </span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as AreaId | "")}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <option value="">No area</option>
              {Object.entries(AREAS).map(([id, a]) => (
                <option key={id} value={id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
              Link to journey
            </span>
            <select
              value={journeyId}
              onChange={(e) => setJourneyId(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <option value="">None</option>
              {activeJourneys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Focus Shield
            </span>
            <input
              type="checkbox"
              checked={shieldEnabled}
              onChange={(e) => setShieldEnabled(e.target.checked)}
              className="accent-sage-400"
            />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Auto-start next session
            </span>
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="accent-sage-400"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/focus/blocks"
            className="text-sm px-4 py-2 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="text-sm px-5 py-2 rounded-lg bg-sage-400 text-white hover:bg-sage-500 font-medium"
          >
            Schedule block
          </button>
        </div>
      </form>
    </div>
  );
}
