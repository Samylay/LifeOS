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
import { useTeachProgress } from "@/lib/use-teach-progress";
import { CountUp } from "@/components/count-up";
import { GoalsCard } from "@/components/goals-card";
import { BriefCards } from "@/components/brief/brief-cards";
import { Skeleton } from "@/components/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Brief } from "@/lib/brief-types";
import { calendarDaysBetween, localDayOf } from "@/lib/types";

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
  return calendarDaysBetween(date, new Date());
}

export default function Today() {
  const { habits, toggleToday } = useHabits();
  const { overdue: overdueReminders, dueToday: todayReminders } = useReminders();
  const { messages } = useNotifications();
  const { entries: ships } = useShipLog();
  const teachProgress = useTeachProgress();

  const [now] = useState(() => new Date());
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [briefErr, setBriefErr] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);

  // Optimistic overlay for habit ticks — flips instantly, server catches up.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const loadBrief = useCallback(async () => {
    setBriefRefreshing(true);
    try {
      const res = await fetch("/api/brief-json");
      if (!res.ok) throw new Error();
      setBrief(await res.json());
      setBriefErr(false);
    } catch {
      setBriefErr(true);
    } finally {
      setBriefRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  // Same civil-day key `toggledHabitState` writes with. Both used UTC before,
  // so they agreed with each other but both pointed at yesterday between
  // midnight and 02:00 Paris time.
  const todayStr = localDayOf(new Date());
  // Local-date YYYY-MM-DD for the stale-brief check (the brief is written in
  // local time; UTC would flag it stale every evening).
  const todayLocal = new Date().toLocaleDateString("en-CA");
  const todayHabits = habits.filter((h) => h.frequency === "daily");
  const isDone = (h: (typeof todayHabits)[number]) =>
    h.id in optimistic
      ? optimistic[h.id]
      : h.history.some((e) => e.date === todayStr && e.completed);
  const habitsDone = todayHabits.filter(isDone).length;

  const handleToggle = (id: string, currentlyDone: boolean) => {
    setOptimistic((o) => ({ ...o, [id]: !currentlyDone }));
    // T37 haptics: a short buzz only on completion (not un-ticks), fired here
    // in the UI layer so the hook's data logic stays pure.
    if (!currentlyDone) navigator.vibrate?.(10);
    toggleToday(id);
  };

  const nextReminder = [...overdueReminders, ...todayReminders][0];
  const pagerUnread = messages.filter((m) => !m.readAt).length;

  // Ship momentum
  // rolling 30×24h window (elapsed time), unlike the calendar-day prose below
  const shipped30d = ships.filter((s) => s.date && now.getTime() - new Date(s.date).getTime() <= 30 * 86400_000).length;
  const lastShip = ships
    .map((s) => (s.date ? new Date(s.date) : null))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const daysSinceShip = lastShip ? daysSince(lastShip) : null;

  return (
    // Phone is a feed, desktop is a cockpit: one scrolling column on mobile;
    // at lg the brief takes the main column and the quick loop / goals /
    // habits stack becomes a right rail, so the whole day is above the fold.
    <div className="space-y-4 lg:space-y-6 max-w-2xl lg:max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="flex items-center gap-2 text-foreground">
            {now.getHours() < 18 ? <Sun size={20} className="text-primary" /> : <Moon size={20} className="text-primary" />}
            {greeting()}, Samy
          </h1>
          <p className="text-sm mt-0.5 text-muted-foreground/70">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {teachProgress && (
            <p className="text-xs mt-1 text-muted-foreground/70 truncate max-w-md">
              Learning — {teachProgress.text}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/pager"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium pressable active:scale-[0.97] ${
              pagerUnread > 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <BellRing size={12} /> {pagerUnread > 0 ? `${pagerUnread} unread` : "Pager"}
          </Link>
          {nextReminder && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                overdueReminders.length > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              }`}
            >
              {overdueReminders.length > 0 ? <AlertTriangle size={12} /> : <Bell size={12} />}
              {nextReminder.title}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {/* Morning brief — the live daily loop, anchor of this page; first on
          mobile and the main column on desktop */}
      <div className="enter lg:col-start-1 lg:row-start-1 min-w-0" style={{ ["--enter-delay" as string]: "120ms" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="section-label flex items-center gap-2">
              <Flag size={14} className="text-primary" /> Morning brief
            </h2>
            {brief && brief.source !== "live" && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                Fixture — brief not built
              </span>
            )}
            {brief?.brief?.date && brief.brief.date < todayLocal && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                Stale · {brief.brief.date}
              </span>
            )}
            {briefErr && brief && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                Refresh failed
              </span>
            )}
          </div>
          <Button
            onClick={loadBrief}
            disabled={briefRefreshing}
            aria-label="Refresh brief"
            title="Refresh brief"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/70 bg-muted active:scale-[0.92]"
          >
            <RefreshCw size={14} className={briefRefreshing ? "animate-spin" : undefined} />
          </Button>
        </div>
        {briefErr && !brief && (
          <Card className="p-4 text-sm text-muted-foreground">
            Couldn&apos;t load the brief.
          </Card>
        )}
        {!brief && !briefErr && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}
        {brief?.brief && <BriefCards brief={brief.brief} />}
      </div>

      {/* Right rail on desktop; below the brief on mobile */}
      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 min-w-0">

      {/* Quick loop: Prime entry + ship momentum */}
      <div className="grid grid-cols-2 gap-3 enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <Link href="/prime" className="block">
          <Card className="flex-row items-center gap-3 p-4 hover-lift">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-accent">
              <Sunrise size={18} className="text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Daily Prime</p>
              <p className="text-xs text-muted-foreground/70">Start the ritual →</p>
            </div>
          </Card>
        </Link>
        <Link href="/projects" className="block">
          <Card className="flex-row items-center gap-3 p-4 hover-lift">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-accent">
              <Rocket size={18} className="text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-foreground">
                <CountUp value={shipped30d} className="text-xl font-semibold leading-none tracking-tight" />
                <span className="text-sm font-normal ml-1 text-muted-foreground/70">shipped / 30d</span>
              </p>
              <p className="text-xs mt-1 text-muted-foreground/70">
                {daysSinceShip === null ? "No ships logged yet" : `Last ship ${daysSinceShip}d ago`}
              </p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Goals */}
      <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
        <GoalsCard />
      </div>

      {/* Habits */}
      {todayHabits.length > 0 && (
        <Card className="p-4 lg:p-5 gap-3 enter" style={{ ["--enter-delay" as string]: "90ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="section-label">
              Habits
            </h2>
            <span className="text-xs font-mono text-primary">
              {habitsDone}/{todayHabits.length}
            </span>
          </div>
          {/* lg keeps one column: two columns cramp inside the 340px rail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {todayHabits.map((habit) => {
              const done = isDone(habit);
              return (
                <button
                  key={habit.id}
                  onClick={() => handleToggle(habit.id, done)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left pressable active:scale-[0.97] bg-muted"
                >
                  <div
                    className={`shrink-0 h-5 w-5 rounded flex items-center justify-center ${
                      done ? "bg-primary border-none" : "border-[1.5px] border-muted-foreground/70 bg-transparent"
                    }`}
                  >
                    {done && <Check size={12} className="text-primary-foreground" />}
                  </div>
                  <span
                    className={`text-sm flex-1 truncate ${done ? "text-foreground line-through opacity-60" : "text-foreground"}`}
                  >
                    {habit.name}
                  </span>
                  {habit.streak > 0 && (
                    <span className="flex items-center gap-1 text-xs font-mono shrink-0 text-primary">
                      <Flame size={10} />{habit.streak}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      </div>
      </div>
    </div>
  );
}
