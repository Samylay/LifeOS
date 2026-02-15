"use client";

import { useMemo } from "react";
import { BookOpen, Flame, Target, CheckCircle, TrendingUp, Calendar, Timer, Brain } from "lucide-react";
import { useTasks } from "@/lib/use-tasks";
import { useFocusTimer } from "@/lib/use-focus";
import { useHabits } from "@/lib/use-habits";
import { useProjects } from "@/lib/use-projects";
import { useDailyLog } from "@/lib/use-daily-log";
import { useStreaks } from "@/lib/use-streaks";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";

function getWeekDates() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return { start, end, dates };
}

function StatCard({ label, value, suffix, icon: Icon, color }: {
  label: string; value: string | number; suffix?: string;
  icon: typeof Flame; color: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span className="text-2xl font-bold font-mono" style={{ color }}>
        {value}{suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}

export default function ReviewPage() {
  const { tasks } = useTasks();
  const { todaySessions } = useFocusTimer();
  const { habits } = useHabits();
  const { projects } = useProjects();
  const { log: todayLog } = useDailyLog();
  const { streaks } = useStreaks();

  const week = useMemo(() => getWeekDates(), []);

  const tasksCompletedThisWeek = tasks.filter(
    (t) => t.status === "done" && t.updatedAt && new Date(t.updatedAt) >= week.start && new Date(t.updatedAt) <= week.end
  ).length;

  const tasksCreatedThisWeek = tasks.filter(
    (t) => t.createdAt && new Date(t.createdAt) >= week.start && new Date(t.createdAt) <= week.end
  ).length;

  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done" && t.status !== "cancelled"
  );

  const totalFocusMinutes = todaySessions
    .filter((s) => s.type === "focus" && s.status === "completed")
    .reduce((sum, s) => sum + (s.actualDuration || 0), 0);

  const activeProjects = projects.filter((p) => p.status === "active");
  const staleProjects = activeProjects.filter((p) => {
    const linkedDone = tasks.filter(
      (t) => t.projectId === p.id && t.status === "done" && t.updatedAt && new Date(t.updatedAt) >= week.start
    ).length;
    return linkedDone === 0;
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const habitsCompletedToday = habits.filter((h) => h.history.some((hh) => hh.date === todayStr && hh.completed)).length;
  const habitsTotal = habits.length;

  const tasksByArea = Object.keys(AREAS).reduce((acc, area) => {
    const areaTasks = tasks.filter((t) => t.area === area && t.status === "done" && t.updatedAt &&
      new Date(t.updatedAt) >= week.start && new Date(t.updatedAt) <= week.end);
    acc[area as AreaId] = areaTasks.length;
    return acc;
  }, {} as Record<AreaId, number>);

  const AREA_COLORS: Record<string, string> = {
    health: "#14B8A6", career: "#6366F1", finance: "#F59E0B", brand: "#8B5CF6", admin: "#64748B",
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BookOpen size={24} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Weekly Review</h1>
        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
          Week of {week.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Tasks Completed" value={tasksCompletedThisWeek} icon={CheckCircle} color="#10B981" />
        <StatCard label="Focus Time" value={(totalFocusMinutes / 60).toFixed(1)} suffix="h" icon={Timer} color="var(--accent)" />
        <StatCard label="Current Streak" value={streaks.focus.current} suffix=" days" icon={Flame} color="#F59E0B" />
        <StatCard label="Habits Today" value={`${habitsCompletedToday}/${habitsTotal}`} icon={Target} color="#6366F1" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Area Breakdown */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Area Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(AREAS).map(([id, area]) => {
              const count = tasksByArea[id as AreaId] || 0;
              return (
                <div key={id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: AREA_COLORS[id] }} />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{area.name}</span>
                  </div>
                  <span className="text-sm font-mono" style={{ color: AREA_COLORS[id] }}>{count} done</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Projects Status */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Project Status</h2>
          {activeProjects.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No active projects.</p>
          ) : (
            <div className="space-y-2">
              {activeProjects.map((project) => {
                const isStale = staleProjects.some((p) => p.id === project.id);
                const projectTasks = tasks.filter((t) => t.projectId === project.id);
                const doneTasks = projectTasks.filter((t) => t.status === "done").length;
                const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
                return (
                  <div key={project.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{project.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{progress}% complete</span>
                        {isStale && <span className="text-xs px-1 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>No progress this week</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue Tasks */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: overdueTasks.length > 0 ? "#EF4444" : "var(--text-secondary)" }}>
            Overdue Tasks ({overdueTasks.length})
          </h2>
          {overdueTasks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No overdue tasks. Great job!</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {overdueTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                  <span className="text-sm truncate flex-1" style={{ color: "var(--text-primary)" }}>{task.title}</span>
                  {task.dueDate && (
                    <span className="text-xs ml-2 shrink-0" style={{ color: "#EF4444" }}>
                      {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Reflection Prompt */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
            <Brain size={14} className="inline mr-1" /> Reflection Prompts
          </h2>
          <div className="space-y-3">
            <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--accent)" }}>What went well?</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {tasksCompletedThisWeek > 0 ? `You completed ${tasksCompletedThisWeek} tasks this week.` : "Review what you accomplished."}
                {streaks.focus.current > 1 ? ` Focus streak: ${streaks.focus.current} days.` : ""}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "#F59E0B" }}>What needs attention?</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {overdueTasks.length > 0 ? `${overdueTasks.length} overdue tasks need action. ` : ""}
                {staleProjects.length > 0 ? `${staleProjects.length} projects had no progress this week.` : "All active projects moved forward."}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "#6366F1" }}>Next week focus</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {tasksCreatedThisWeek > tasksCompletedThisWeek
                  ? "More tasks created than completed. Focus on clearing the backlog."
                  : "Good task throughput. Keep the momentum going."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
