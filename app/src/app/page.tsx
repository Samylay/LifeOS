"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Bell,
  Check,
  AlertTriangle,
  Flame,
  RefreshCw,
  Sunrise,
  BellRing,
  Rocket,
  Flag,
} from "lucide-react";
import Link from "next/link";
import { useHabits } from "@/lib/use-habits";
import { useReminders } from "@/lib/use-reminders";
import { useNotifications } from "@/lib/use-notifications";
import { useShipLog } from "@/lib/use-ship-log";
import { CountUp } from "@/components/count-up";
import { GoalsCard } from "@/components/goals-card";
import { BriefCards } from "@/components/brief/brief-cards";
import { Skeleton } from "@/components/skeleton";
import type { Brief } from "@/lib/brief-types";

interface BriefResponse {
  source: "live" | "fixture";
  brief: Brief;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

export default function Today() {
  const { habits, toggleToday } = useHabits();
  const { overdue: overdueReminders, dueToday: todayReminders } = useReminders();
  const { messages } = useNotifications();
  const { entries: ships } = useShipLog();

  const [now] = useState(() => new Date());
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [briefErr, setBriefErr] = useState(false);

  // Optimistic overlay for habit ticks — flips instantly, server catches up.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const loadBrief = useCallback(async () => {
    try {
      const res = await fetch("/api/brief-json");
      if (!res.ok) throw new Error();
      setBrief(await res.json());
      setBriefErr(false);
    } catch {
      setBriefErr(true);
    }
  }, []);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayHabits = habits.filter((h) => h.frequency === "daily");
  const isDone = (h: (typeof todayHabits)[number]) =>
    h.id in optimistic
      ? optimistic[h.id]
      : h.history.some((e) => e.date === todayStr && e.completed);
  const habitsDone = todayHabits.filter(isDone).length;

  const handleToggle = (id: string, currentlyDone: boolean) => {
    setOptimistic((o) => ({ ...o, [id]: !currentlyDone }));
    toggleToday(id);
  };

  const nextReminder = [...overdueReminders, ...todayReminders][0];
  const pagerUnread = messages.filter((m) => !m.readAt).length;

  // Ship momentum
  const shipped30d = ships.filter((s) => s.date && daysSince(new Date(s.date)) <= 30).length;
  const lastShip = ships
    .map((s) => (s.date ? new Date(s.date) : null))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const daysSinceShip = lastShip ? daysSince(lastShip) : null;

  return (
    <div className="space-y-4 lg:space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap enter">
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
          <Link
            href="/pager"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-transform duration-150 active:scale-[0.97]"
            style={{
              background: pagerUnread > 0 ? "var(--accent-bg)" : "var(--bg-tertiary)",
              color: pagerUnread > 0 ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <BellRing size={12} /> {pagerUnread > 0 ? `${pagerUnread} unread` : "Pager"}
          </Link>
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

      {/* Quick loop: Prime entry + ship momentum */}
      <div className="grid grid-cols-2 gap-3 enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <Link
          href="/prime"
          className="flex items-center gap-3 rounded-xl p-4 hover-lift"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: "var(--accent-bg)" }}>
            <Sunrise size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Daily Prime</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Start the ritual →</p>
          </div>
        </Link>
        <Link
          href="/projects"
          className="flex items-center gap-3 rounded-xl p-4 hover-lift"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: "var(--accent-bg)" }}>
            <Rocket size={18} style={{ color: shipped30d === 0 ? "#EF4444" : "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-primary" style={{ color: "var(--text-primary)" }}>
              <CountUp value={shipped30d} className="text-xl font-semibold leading-none tracking-tight" />
              <span className="text-sm font-normal ml-1" style={{ color: "var(--text-tertiary)" }}>shipped / 30d</span>
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              {daysSinceShip === null ? "Nothing logged yet" : `${daysSinceShip}d since last ship`}
            </p>
          </div>
        </Link>
      </div>

      {/* Goals */}
      <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
        <GoalsCard />
      </div>

      {/* Habits */}
      {todayHabits.length > 0 && (
        <div
          className="rounded-xl p-4 lg:p-5 enter"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", ["--enter-delay" as string]: "90ms" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Habits
            </h2>
            <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
              {habitsDone}/{todayHabits.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayHabits.map((habit) => {
              const done = isDone(habit);
              return (
                <button
                  key={habit.id}
                  onClick={() => handleToggle(habit.id, done)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-transform duration-150 active:scale-[0.97]"
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

      {/* Morning brief — the live daily loop, anchor of this page */}
      <div className="enter" style={{ ["--enter-delay" as string]: "120ms" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
            <Flag size={14} style={{ color: "var(--accent)" }} /> Morning brief
          </h2>
          <button
            onClick={loadBrief}
            aria-label="Refresh brief"
            title="Refresh brief"
            className="p-2 rounded-lg transition-transform duration-150 active:scale-[0.92]"
            style={{ color: "var(--text-tertiary)", background: "var(--bg-tertiary)" }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {briefErr && !brief && (
          <div className="rounded-xl p-4 text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
            Couldn&apos;t load the brief.
          </div>
        )}
        {!brief && !briefErr && (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}
        {brief?.brief && <BriefCards brief={brief.brief} />}
      </div>
    </div>
  );
}
