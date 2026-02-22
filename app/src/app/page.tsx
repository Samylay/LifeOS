"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Flame,
  Sun,
  Moon,
  Timer,
  CheckCircle,
  ArrowRight,
  Dumbbell,
  Bell,
  BookOpen,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTasks } from "@/lib/use-tasks";
import { useFocusTimer } from "@/lib/use-focus";
import { useDailyLog } from "@/lib/use-daily-log";
import { useHabits } from "@/lib/use-habits";
import { useReminders } from "@/lib/use-reminders";
import { useWorkouts } from "@/lib/use-workouts";
import { useBooks } from "@/lib/use-books";
import { MorningCheckIn, EveningReflection } from "@/components/daily-log";
import { TaskItem } from "@/components/task-list";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { AREAS } from "@/lib/types";
import { useIntegrations } from "@/lib/integrations-context";
import { useGoogleCalendar } from "@/lib/use-google-calendar";
import { ExternalLink, Loader2, Clock } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const { tasks, updateTask, deleteTask } = useTasks();
  const { todayFocusMinutes, todayCompletedSessions } = useFocusTimer();
  const { log, updateLog } = useDailyLog();
  const { habits, toggleToday } = useHabits();
  const { overdue: overdueReminders, dueToday: todayReminders, completeReminder } = useReminders();
  const { thisWeek: weekWorkouts } = useWorkouts();
  const { reading: currentlyReading } = useBooks();
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

  const today = new Date().toISOString().split("T")[0];
  const todayHabits = habits.filter((h) => h.frequency === "daily");
  const habitsDone = todayHabits.filter((h) =>
    h.history.some((e) => e.date === today && e.completed)
  ).length;

  // Tomorrow's Top 3
  const [tomorrowTasks, setTomorrowTasks] = useState<string[]>([]);
  useEffect(() => {
    if (log?.tomorrowTop3) setTomorrowTasks(log.tomorrowTop3);
  }, [log]);
  const handleTomorrowChange = (index: number, value: string) => {
    const updated = [...tomorrowTasks];
    updated[index] = value;
    setTomorrowTasks(updated);
    updateLog({ tomorrowTop3: updated });
  };

  const firstName = user?.displayName?.split(" ")[0] || "";

  const greeting = () => {
    const hour = new Date().getHours();
    const name = firstName ? `, ${firstName}` : "";
    if (hour < 12) return `Good morning${name}`;
    if (hour < 17) return `Good afternoon${name}`;
    return `Good evening${name}`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {greeting()}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
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
            AM
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
            PM
          </button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>
            {habitsDone}/{todayHabits.length}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Habits</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{weekWorkouts.length}</p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Workouts</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{completedToday.length}</p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Done today</p>
        </div>
      </div>

      {view === "morning" ? (
        <div className="grid grid-cols-12 gap-4 lg:gap-6">

          {/* Reminders alert */}
          {(overdueReminders.length > 0 || todayReminders.length > 0) && (
            <div className="col-span-12 rounded-xl p-4" style={{
              background: overdueReminders.length > 0 ? "#EF444408" : "var(--bg-secondary)",
              border: overdueReminders.length > 0 ? "1px solid #EF444430" : "1px solid var(--border-primary)",
            }}>
              <div className="flex items-center gap-2 mb-3">
                {overdueReminders.length > 0 ? (
                  <AlertTriangle size={16} style={{ color: "#EF4444" }} />
                ) : (
                  <Bell size={16} style={{ color: "var(--accent)" }} />
                )}
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {overdueReminders.length > 0
                    ? `${overdueReminders.length} overdue`
                    : `${todayReminders.length} due today`}
                </span>
                <Link href="/reminders" className="ml-auto text-xs font-medium" style={{ color: "var(--accent)" }}>
                  View all
                </Link>
              </div>
              <div className="space-y-1.5">
                {[...overdueReminders, ...todayReminders].slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <button
                      onClick={() => completeReminder(r.id)}
                      className="shrink-0 h-4 w-4 rounded-full flex items-center justify-center"
                      style={{ border: "1.5px solid var(--text-tertiary)" }}
                    />
                    <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{r.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's habits */}
          {todayHabits.length > 0 && (
            <div className="col-span-12 lg:col-span-6 rounded-xl p-4 lg:p-5" style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
            }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Daily Habits
                </h2>
                <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                  {habitsDone}/{todayHabits.length}
                </span>
              </div>
              <div className="space-y-2">
                {todayHabits.map((habit) => {
                  const done = habit.history.some((h) => h.date === today && h.completed);
                  return (
                    <button
                      key={habit.id}
                      onClick={() => toggleToday(habit.id)}
                      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all active:scale-[0.98]"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      <div
                        className="shrink-0 h-5 w-5 rounded flex items-center justify-center"
                        style={{
                          border: done ? "none" : "1.5px solid var(--text-tertiary)",
                          background: done ? "var(--accent)" : "transparent",
                        }}
                      >
                        {done && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm flex-1" style={{
                        color: "var(--text-primary)",
                        textDecoration: done ? "line-through" : "none",
                        opacity: done ? 0.6 : 1,
                      }}>
                        {habit.name}
                      </span>
                      {habit.streak > 0 && (
                        <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "var(--accent)" }}>
                          <Flame size={10} />{habit.streak}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Link href="/workouts" className="flex items-center gap-2.5 rounded-xl px-4 py-3 transition-all active:scale-95"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
                <Dumbbell size={18} style={{ color: "#7C9E8A" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Workout</p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{weekWorkouts.length} this week</p>
                </div>
              </Link>
              <Link href="/reading" className="flex items-center gap-2.5 rounded-xl px-4 py-3 transition-all active:scale-95"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
                <BookOpen size={18} style={{ color: "#8B5CF6" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Reading</p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{currentlyReading.length} active</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Energy Check-in */}
          <div className="col-span-12 lg:col-span-4">
            <MorningCheckIn log={log} onUpdate={updateLog} />
          </div>

          {/* Today's Schedule */}
          <div className="col-span-12 lg:col-span-8 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sun size={18} style={{ color: "#F59E0B" }} />
                <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Schedule</h2>
              </div>
              <Link href="/calendar" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Calendar <ArrowRight size={10} className="inline" />
              </Link>
            </div>
            {!gcal.connected ? (
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Connect Google Calendar to see your schedule.</p>
                <button onClick={async () => { setGcalConnecting(true); try { await connectGoogleCalendar(); } catch {} finally { setGcalConnecting(false); } }}
                  disabled={gcalConnecting}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shrink-0" style={{ background: "#4285F4" }}>
                  {gcalConnecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} Connect
                </button>
              </div>
            ) : !gcalHasToken ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Session expired — reconnect in Settings.</p>
            ) : calEvents.filter((e) => e.start.toDateString() === new Date().toDateString()).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No events today.</p>
            ) : (
              <div className="space-y-2">
                {calEvents.filter((e) => e.start.toDateString() === new Date().toDateString()).slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-center gap-2 text-sm">
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#4285F4" }} />
                    <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{event.title}</span>
                    <span className="flex items-center gap-1 text-xs shrink-0 ml-auto" style={{ color: "var(--text-tertiary)" }}>
                      <Clock size={10} />
                      {(event as { allDay?: boolean }).allDay ? "All day" : event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority Tasks */}
          <div className="col-span-12 md:col-span-6 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <LayoutDashboard size={18} style={{ color: "var(--accent)" }} />
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Priority Tasks</h2>
            </div>
            {priorityTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No tasks yet.</p>
            ) : (
              <div className="space-y-2">
                {priorityTasks.map((task) => (
                  <TaskItem key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
                ))}
              </div>
            )}
          </div>

          {/* Focus */}
          <div className="col-span-12 md:col-span-6 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <Timer size={18} style={{ color: "var(--accent)" }} />
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Focus</h2>
            </div>
            <div className="flex justify-between items-center mb-3">
              <div className="text-center">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>{todayCompletedSessions}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sessions</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>{todayFocusMinutes}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Minutes</p>
              </div>
            </div>
            <Link href="/focus"
              className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
              <Timer size={16} /> Start Focus
            </Link>
          </div>
        </div>
      ) : (
        /* ========= EVENING VIEW ========= */
        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          {/* Day Review */}
          <div className="col-span-12 lg:col-span-8 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={18} style={{ color: "var(--accent)" }} />
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Day Review</h2>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{todayCompletedSessions}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sessions</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{todayFocusMinutes}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Minutes</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{completedToday.length}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Tasks</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{habitsDone}/{todayHabits.length}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Habits</p>
              </div>
            </div>
            {completedToday.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Completed today</p>
                {completedToday.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                    <CheckCircle size={14} style={{ color: "var(--accent)" }} />
                    <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Focus today */}
          <div className="col-span-12 lg:col-span-4 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <Timer size={18} style={{ color: "var(--accent)" }} />
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Focus</h2>
            </div>
            <div className="text-center py-4">
              <span className="text-4xl font-bold font-mono tabular-nums" style={{ color: "var(--accent)" }}>
                {todayFocusMinutes}
              </span>
              <p className="text-xs mt-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-tertiary)" }}>Minutes today</p>
            </div>
          </div>

          {/* Tomorrow's Top 3 */}
          <div className="col-span-12 md:col-span-6 rounded-xl p-4 lg:p-5" style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)",
          }}>
            <h2 className="text-base font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Tomorrow&apos;s Top 3
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              What are the 3 most important things to do tomorrow?
            </p>
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>{i + 1}</span>
                  <input type="text" value={tomorrowTasks[i] || ""} onChange={(e) => handleTomorrowChange(i, e.target.value)}
                    placeholder={`Priority ${i + 1}...`}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Gratitude & Reflection */}
          <div className="col-span-12 md:col-span-6">
            <EveningReflection log={log} onUpdate={updateLog} />
          </div>
        </div>
      )}
    </div>
  );
}
