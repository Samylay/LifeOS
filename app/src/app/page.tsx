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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    // Phone is a feed, desktop is a cockpit: one scrolling column on mobile;
    // at lg the brief takes the main column and the quick loop / goals /
    // habits stack becomes a right rail, so the whole day is above the fold.
    <div className="space-y-4 lg:space-y-6 max-w-2xl lg:max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold flex items-center gap-2 text-foreground">
            {now.getHours() < 18 ? <Sun size={20} className="text-primary" /> : <Moon size={20} className="text-primary" />}
            {greeting()}, Samy
          </h1>
          <p className="text-sm mt-0.5 text-muted-foreground/70">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/pager"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-transform duration-150 active:scale-[0.97] ${
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
      {/* Right rail on desktop (first in DOM to keep the mobile order) */}
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
              <Rocket size={18} className={shipped30d === 0 ? "text-destructive" : "text-accent-foreground"} />
            </div>
            <div className="min-w-0">
              <p className="text-foreground">
                <CountUp value={shipped30d} className="text-xl font-semibold leading-none tracking-tight" />
                <span className="text-sm font-normal ml-1 text-muted-foreground/70">shipped / 30d</span>
              </p>
              <p className="text-xs mt-1 text-muted-foreground/70">
                {daysSinceShip === null ? "Nothing logged yet" : `${daysSinceShip}d since last ship`}
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
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Habits
            </h2>
            <span className="text-xs font-mono text-primary">
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
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-transform duration-150 active:scale-[0.97] bg-muted"
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

      {/* Morning brief — the live daily loop, anchor of this page; the main
          column on desktop */}
      <div className="enter lg:col-start-1 lg:row-start-1 min-w-0" style={{ ["--enter-delay" as string]: "120ms" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
            <Flag size={14} className="text-primary" /> Morning brief
          </h2>
          <Button
            onClick={loadBrief}
            aria-label="Refresh brief"
            title="Refresh brief"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/70 bg-muted active:scale-[0.92]"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        {briefErr && !brief && (
          <Card className="p-4 text-sm text-muted-foreground">
            Couldn&apos;t load the brief.
          </Card>
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
    </div>
  );
}
