"use client";

import { useState } from "react";
import {
  Sun,
  Moon,
  Bell,
  Check,
  AlertTriangle,
  ListTodo,
  Flame,
} from "lucide-react";
import Link from "next/link";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useReminders } from "@/lib/use-reminders";
import { TaskItem } from "@/components/task-list";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";
import { CockpitTraining, CockpitHomelab } from "@/components/cockpit-status";
import { StrengthCard } from "@/components/strength-card";
import { KnowledgeCard } from "@/components/knowledge-card";
import { GoalsCard } from "@/components/goals-card";

const AREA_ORDER: AreaId[] = ["health", "career", "finance", "brand", "admin"];
const AREA_HEX: Record<AreaId, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#6B6560",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { tasks, updateTask, deleteTask } = useTasks();
  const { habits, toggleToday } = useHabits();
  const { overdue: overdueReminders, dueToday: todayReminders, completeReminder } = useReminders();

  const [now] = useState(() => new Date());

  const activeTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");

  const priorityTasks = [...activeTasks]
    .sort((a, b) => {
      const p: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pd = (p[a.priority] ?? 3) - (p[b.priority] ?? 3);
      if (pd !== 0) return pd;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    })
    .slice(0, 3);

  const todayStr = new Date().toISOString().split("T")[0];
  const tasksDueToday = activeTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toISOString().split("T")[0] === todayStr
  );

  const todayHabits = habits.filter((h) => h.frequency === "daily");
  const habitsDone = todayHabits.filter((h) =>
    h.history.some((e) => e.date === todayStr && e.completed)
  ).length;

  const nextReminder = [...overdueReminders, ...todayReminders][0];

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* 1. Daily brief header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            {now.getHours() < 18 ? <Sun size={20} style={{ color: "var(--accent)" }} /> : <Moon size={20} style={{ color: "var(--accent)" }} />}
            {greeting()}, Samy
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {tasksDueToday.length > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
            >
              <ListTodo size={12} /> {tasksDueToday.length} due today
            </span>
          )}
          {nextReminder && (
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium"
              style={{
                background: overdueReminders.length > 0 ? "#EF444412" : "var(--bg-tertiary)",
                color: overdueReminders.length > 0 ? "#EF4444" : "var(--text-secondary)",
              }}
            >
              {overdueReminders.length > 0 ? <AlertTriangle size={12} /> : <Bell size={12} />}
              {nextReminder.title}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* 1b. This week (goals) */}
        <div className="col-span-12 lg:col-span-6">
          <GoalsCard />
        </div>

        {/* 2. Focus */}
        <div
          className="col-span-12 lg:col-span-6 rounded-xl p-4 lg:p-5"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Focus
            </h2>
            <Link href="/tasks" className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              All tasks
            </Link>
          </div>
          {priorityTasks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Nothing on your plate. Nice.</p>
          ) : (
            <div className="space-y-2">
              {priorityTasks.map((task) => (
                <TaskItem key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
              ))}
            </div>
          )}
        </div>

        {/* 3. Training */}
        <div className="col-span-12 lg:col-span-6">
          <CockpitTraining />
        </div>

        {/* 3b. Strength */}
        <div className="col-span-12 lg:col-span-6">
          <StrengthCard />
        </div>

        {/* 4. Areas glance */}
        <div
          className="col-span-12 lg:col-span-6 rounded-xl p-4 lg:p-5"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
        >
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>
            Areas
          </h2>
          <div className="space-y-1.5">
            {AREA_ORDER.map((id) => {
              const meta = AREAS[id];
              const count = activeTasks.filter((t) => t.area === id).length;
              return (
                <Link
                  key={id}
                  href={`/areas/${id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 -mx-2.5 transition-colors hover:bg-[var(--bg-tertiary)]"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: AREA_HEX[id], boxShadow: `0 0 6px -1px ${AREA_HEX[id]}` }}
                  />
                  <span className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>{meta.name}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{count} open</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 5. Homelab */}
        <div className="col-span-12 lg:col-span-6">
          <CockpitHomelab />
        </div>

        {/* 5b. Knowledge */}
        <div className="col-span-12 lg:col-span-6">
          <KnowledgeCard />
        </div>

        {/* Reminders alert */}
        {(overdueReminders.length > 0 || todayReminders.length > 0) && (
          <div
            className="col-span-12 lg:col-span-6 rounded-xl p-4"
            style={{
              background: overdueReminders.length > 0 ? "#EF444408" : "var(--bg-secondary)",
              border: overdueReminders.length > 0 ? "1px solid #EF444430" : "1px solid var(--border-primary)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              {overdueReminders.length > 0 ? (
                <AlertTriangle size={16} style={{ color: "#EF4444" }} />
              ) : (
                <Bell size={16} style={{ color: "var(--accent)" }} />
              )}
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                {overdueReminders.length > 0 ? `${overdueReminders.length} overdue` : `${todayReminders.length} due today`}
              </span>
              <Link href="/reminders" className="ml-auto text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
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

        {/* 6. Habits / streaks */}
        {todayHabits.length > 0 && (
          <div
            className="col-span-12 rounded-xl p-4 lg:p-5"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                Habits
              </h2>
              <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                {habitsDone}/{todayHabits.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {todayHabits.map((habit) => {
                const done = habit.history.some((h) => h.date === todayStr && h.completed);
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
                    <span
                      className="text-sm flex-1 truncate"
                      style={{ color: "var(--text-primary)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}
                    >
                      {habit.name}
                    </span>
                    {habit.streak > 0 && (
                      <span className="flex items-center gap-1 text-xs font-mono shrink-0" style={{ color: "var(--accent)" }}>
                        <Flame size={10} />{habit.streak}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
