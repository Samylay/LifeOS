"use client";

import { Play, Pause, Square, SkipForward, Flame } from "lucide-react";
import { useFocusTimer } from "@/lib/use-focus";
import { useStreaks } from "@/lib/use-streaks";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusPage() {
  const {
    timerState,
    sessionType,
    timeRemaining,
    totalTime,
    completedSessions,
    interruptions,
    linkedArea,
    setLinkedArea,
    start,
    pause,
    resume,
    stop,
    skip,
    todayFocusMinutes,
    todayCompletedSessions,
    config,
  } = useFocusTimer();

  const { streaks, recordFocusDay } = useStreaks();

  const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference * (1 - progress);

  const isBreak = sessionType === "break" || sessionType === "long_break";

  const ringColor = isBreak
    ? "#3B82F6"
    : timerState === "paused"
    ? "#F59E0B"
    : "var(--accent)";

  const sessionLabel = sessionType === "focus"
    ? "FOCUS"
    : sessionType === "break"
    ? "BREAK"
    : "LONG BREAK";

  const handleStart = () => {
    start();
    if (sessionType === "focus") {
      recordFocusDay();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      {/* Timer Ring */}
      <div className="relative flex items-center justify-center mb-8">
        <svg width="240" height="240" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="90" fill="none" stroke="var(--bg-tertiary)" strokeWidth="6" />
          <circle
            cx="120"
            cy="120"
            r="90"
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 120 120)"
            className="transition-all"
            style={{
              transitionDuration: "1s",
              transitionTimingFunction: "linear",
              filter: timerState === "paused" ? "none" : `drop-shadow(0 0 6px ${ringColor}40)`,
            }}
          />
        </svg>
        <div className="absolute text-center">
          <span
            className="text-5xl font-bold font-mono tabular-nums"
            style={{ color: "var(--text-primary)", opacity: timerState === "paused" ? 0.6 : 1 }}
          >
            {formatTime(timeRemaining)}
          </span>
          <p className="text-xs uppercase tracking-widest font-semibold mt-1" style={{ color: ringColor }}>
            {sessionLabel}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {timerState === "idle" && (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 rounded-xl px-8 py-3 font-medium text-sm text-white transition-colors"
            style={{ background: isBreak ? "#3B82F6" : "var(--accent)" }}
          >
            <Play size={18} fill="white" />
            {isBreak ? "Start Break" : "Start Focus"}
          </button>
        )}
        {timerState === "running" && (
          <>
            <button
              onClick={pause}
              className="flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-sm transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              <Pause size={18} />
              Pause
            </button>
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-sm transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            >
              <Square size={16} />
              Stop
            </button>
          </>
        )}
        {timerState === "paused" && (
          <>
            <button
              onClick={resume}
              className="flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-sm bg-emerald-500 text-white transition-colors"
            >
              <Play size={18} fill="white" />
              Resume
            </button>
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-sm transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            >
              <Square size={16} />
              Stop
            </button>
          </>
        )}
        {isBreak && timerState === "idle" && (
          <button
            onClick={skip}
            className="flex items-center gap-2 rounded-xl px-4 py-3 font-medium text-sm transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <SkipForward size={16} />
            Skip Break
          </button>
        )}
      </div>

      {/* Session info */}
      <div className="text-center space-y-2 mb-8">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Session {completedSessions + 1} of {config.longBreakAfter}
        </p>
        {interruptions > 0 && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {interruptions} interruption{interruptions > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Area selector (only when idle + focus) */}
      {timerState === "idle" && sessionType === "focus" && (
        <div className="mb-8">
          <p className="text-xs font-medium mb-2 text-center" style={{ color: "var(--text-secondary)" }}>
            Link to area
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setLinkedArea(undefined)}
              className="text-xs rounded-lg px-3 py-1.5 transition-colors"
              style={{
                background: !linkedArea ? "var(--accent-bg)" : "var(--bg-tertiary)",
                color: !linkedArea ? "var(--accent)" : "var(--text-tertiary)",
                border: `1px solid ${!linkedArea ? "var(--accent)" : "var(--border-primary)"}`,
              }}
            >
              None
            </button>
            {(Object.entries(AREAS) as [AreaId, (typeof AREAS)[AreaId]][]).map(([id, area]) => (
              <button
                key={id}
                onClick={() => setLinkedArea(id)}
                className="text-xs rounded-lg px-3 py-1.5 transition-colors"
                style={{
                  background: linkedArea === id ? "var(--accent-bg)" : "var(--bg-tertiary)",
                  color: linkedArea === id ? "var(--accent)" : "var(--text-tertiary)",
                  border: `1px solid ${linkedArea === id ? "var(--accent)" : "var(--border-primary)"}`,
                }}
              >
                {area.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today's stats bar */}
      <div
        className="flex gap-8 rounded-xl px-8 py-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
        <div className="text-center">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--accent)" }}>
            {todayCompletedSessions}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sessions</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--accent)" }}>
            {todayFocusMinutes}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Minutes</p>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1 justify-center">
            <Flame size={16} style={{ color: "var(--accent)" }} />
            <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--accent)" }}>
              {streaks.focus.current}
            </p>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Day Streak</p>
        </div>
      </div>
    </div>
  );
}
