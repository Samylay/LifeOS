"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Flame,
  Target,
  Sword,
  Sun,
  Moon,
  Timer,
  CheckCircle,
  ArrowRight,
  GripVertical,
} from "lucide-react";
import { useTasks } from "@/lib/use-tasks";
import { useFocusTimer } from "@/lib/use-focus";
import { useDailyLog } from "@/lib/use-daily-log";
import { useStreaks } from "@/lib/use-streaks";
import { MorningCheckIn, EveningReflection } from "@/components/daily-log";
import { TaskItem } from "@/components/task-list";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { useIntegrations } from "@/lib/integrations-context";
import { useGoogleCalendar } from "@/lib/use-google-calendar";
import { ExternalLink, Loader2, Clock } from "lucide-react";

export default function Dashboard() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { todayFocusMinutes, todayCompletedSessions } = useFocusTimer();
  const { log, updateLog } = useDailyLog();
  const { streaks } = useStreaks();
  const { gcal, connectGoogleCalendar } = useIntegrations();
  const { events: calEvents, hasToken: gcalHasToken } = useGoogleCalendar();
  const [view, setView] = useState<"morning" | "evening">("morning");
  const [gcalConnecting, setGcalConnecting] = useState(false);

  const activeTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const priorityTasks = activeTasks
    .sort((a, b) => {
      const p: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (p[a.priority] ?? 3) - (p[b.priority] ?? 3);
    })
    .slice(0, 5);

  const completedToday = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.updatedAt &&
      new Date(t.updatedAt).toDateString() === new Date().toDateString()
  );

  // Tomorrow's top 3 (for evening view)
  const [tomorrowTasks, setTomorrowTasks] = useState<string[]>([]);

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Command Center
        </h1>
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <button
            onClick={() => setView("morning")}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: view === "morning" ? "var(--bg-secondary)" : "transparent",
              color: view === "morning" ? "var(--text-primary)" : "var(--text-tertiary)",
              boxShadow: view === "morning" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Sun size={14} />
            Morning
          </button>
          <button
            onClick={() => setView("evening")}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: view === "evening" ? "var(--bg-secondary)" : "transparent",
              color: view === "evening" ? "var(--text-primary)" : "var(--text-tertiary)",
              boxShadow: view === "evening" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Moon size={14} />
            Evening
          </button>
        </div>
      </div>

      {view === "morning" ? (
        /* ========= MORNING VIEW ========= */
        <div className="grid grid-cols-12 gap-6">
          {/* Today's Schedule (span-8) */}
          <div
            className="col-span-12 lg:col-span-8 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sun size={20} style={{ color: "#F59E0B" }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Today&apos;s Schedule
                </h2>
              </div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            {!gcal.connected ? (
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Connect Google Calendar to see your schedule.
                </p>
                <button
                  onClick={async () => {
                    setGcalConnecting(true);
                    try { await connectGoogleCalendar(); } catch {} finally { setGcalConnecting(false); }
                  }}
                  disabled={gcalConnecting}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shrink-0"
                  style={{ background: "#4285F4" }}
                >
                  {gcalConnecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  Connect
                </button>
              </div>
            ) : !gcalHasToken ? (
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Session expired — reconnect to sync.
                </p>
                <button
                  onClick={async () => {
                    setGcalConnecting(true);
                    try { await connectGoogleCalendar(); } catch {} finally { setGcalConnecting(false); }
                  }}
                  disabled={gcalConnecting}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0"
                  style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                >
                  {gcalConnecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  Reconnect
                </button>
              </div>
            ) : calEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No events today.
              </p>
            ) : (
              <div className="space-y-2">
                {calEvents
                  .filter((e) => e.start.toDateString() === new Date().toDateString())
                  .slice(0, 5)
                  .map((event) => (
                    <div key={event.id} className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#4285F4" }} />
                      <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {event.title}
                      </span>
                      <span className="flex items-center gap-1 text-xs shrink-0 ml-auto" style={{ color: "var(--text-tertiary)" }}>
                        <Clock size={10} />
                        {event.allDay
                          ? "All day"
                          : event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                {calEvents.filter((e) => e.start.toDateString() === new Date().toDateString()).length > 5 && (
                  <Link href="/calendar" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    View all events
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Energy Check-in (span-4) */}
          <div className="col-span-12 lg:col-span-4">
            <MorningCheckIn log={log} onUpdate={updateLog} />
          </div>

          {/* Priority Tasks (span-4) */}
          <div
            className="col-span-12 md:col-span-4 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <LayoutDashboard size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Priority Tasks
              </h2>
            </div>
            {priorityTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No tasks yet. Use the capture bar above.
              </p>
            ) : (
              <div className="space-y-2">
                {priorityTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onUpdate={updateTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Focus Streak (span-4) */}
          <div
            className="col-span-12 md:col-span-4 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Flame size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Focus Streak
              </h2>
            </div>
            <div className="text-center py-2">
              <span
                className="text-4xl font-bold font-mono tabular-nums"
                style={{ color: "var(--accent)" }}
              >
                {streaks.focus.current}
              </span>
              <p
                className="text-xs mt-1 uppercase tracking-wider font-medium"
                style={{ color: "var(--text-tertiary)" }}
              >
                Day{streaks.focus.current !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--border-secondary)" }}>
              <div className="text-center">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  {todayCompletedSessions}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sessions</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  {todayFocusMinutes}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Minutes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  {streaks.focus.longest}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Best</p>
              </div>
            </div>
            <Link
              href="/focus"
              className="flex items-center justify-center gap-2 mt-4 rounded-lg py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              <Timer size={16} />
              Start Focus
            </Link>
          </div>

          {/* Active Quests (span-4) */}
          <div
            className="col-span-12 md:col-span-4 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Active Quests
              </h2>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No active quests yet. Create your first quarterly quest.
            </p>
            <Link
              href="/quests"
              className="flex items-center gap-1 mt-3 text-xs font-medium transition-colors"
              style={{ color: "var(--accent)" }}
            >
              Go to Quests <ArrowRight size={12} />
            </Link>
          </div>

          {/* Hero Journeys (span-8) */}
          <div
            className="col-span-12 lg:col-span-8 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sword size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Hero Journeys
              </h2>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Start a Hero Journey to track your long-term mastery.
            </p>
            <Link
              href="/journeys"
              className="flex items-center gap-1 mt-3 text-xs font-medium transition-colors"
              style={{ color: "var(--accent)" }}
            >
              Go to Journeys <ArrowRight size={12} />
            </Link>
          </div>

          {/* Daily Brief (span-4) */}
          <div
            className="col-span-12 lg:col-span-4 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sword size={20} style={{ color: "#6366F1" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Daily Brief
              </h2>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              AI-generated summary will appear here once the LLM is connected in Phase 4.
            </p>
          </div>
        </div>
      ) : (
        /* ========= EVENING VIEW ========= */
        <div className="grid grid-cols-12 gap-6">
          {/* Day Review (span-8) */}
          <div
            className="col-span-12 lg:col-span-8 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Day Review
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div
                className="rounded-lg p-3 text-center"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
                  {todayCompletedSessions}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Focus sessions
                </p>
              </div>
              <div
                className="rounded-lg p-3 text-center"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
                  {todayFocusMinutes}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Focus minutes
                </p>
              </div>
              <div
                className="rounded-lg p-3 text-center"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
                  {completedToday.length}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Tasks done
                </p>
              </div>
            </div>
            {completedToday.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Completed today
                </p>
                {completedToday.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                    <CheckCircle size={14} style={{ color: "var(--accent)" }} />
                    <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Streak Tracker (span-4) */}
          <div
            className="col-span-12 lg:col-span-4 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Flame size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Streak Tracker
              </h2>
            </div>
            <div className="text-center py-4">
              <span
                className="text-4xl font-bold font-mono tabular-nums"
                style={{ color: "var(--accent)" }}
              >
                {streaks.focus.current}
              </span>
              <p className="text-xs mt-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-tertiary)" }}>
                Day streak
              </p>
            </div>
            {streaks.focus.current > 0 && streaks.focus.longest > streaks.focus.current && (
              <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
                Best: {streaks.focus.longest} days
              </p>
            )}
          </div>

          {/* Tomorrow's Top 3 (span-6) */}
          <div
            className="col-span-12 md:col-span-6 rounded-xl p-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              Tomorrow&apos;s Top 3
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              What are the 3 most important things to do tomorrow?
            </p>
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={tomorrowTasks[i] || ""}
                    onChange={(e) => {
                      const updated = [...tomorrowTasks];
                      updated[i] = e.target.value;
                      setTomorrowTasks(updated);
                    }}
                    placeholder={`Priority ${i + 1}...`}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-primary)",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Gratitude & Reflection (span-6) */}
          <div className="col-span-12 md:col-span-6">
            <EveningReflection log={log} onUpdate={updateLog} />
          </div>
        </div>
      )}
    </div>
  );
}
