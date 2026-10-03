"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Check, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { ProgressRing } from "@/components/charts";
import { BriefCards } from "@/components/brief/brief-cards";
import { Celebration } from "@/components/celebration";
import { EmptyState } from "@/components/empty-state";
import { GoalsCard } from "@/components/goals-card";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";
import { habitCompleted, habitDue, scheduledToggle } from "@/lib/habit-schedule";
import { localDayOf } from "@/lib/types";
import { useGarmin } from "@/lib/use-garmin";
import { useHabits } from "@/lib/use-habits";
import { useNotifications } from "@/lib/use-notifications";
import { useReminders } from "@/lib/use-reminders";
import type { Brief } from "@/lib/brief-types";

interface BriefResponse {
  source: "live" | "fixture";
  brief: Brief;
}

function streakText(habit: { streak: number; frequency?: string }, fromGarmin: boolean) {
  const unit = habit.frequency === "weekly" ? "week" : "day";
  const streak = habit.streak > 0 ? `${habit.streak}-${unit} streak` : "";
  if (fromGarmin) return streak ? `From Garmin · ${streak}` : "Done from Garmin";
  return streak || "No streak yet";
}

export default function Today() {
  const { habits, toggleToday } = useHabits();
  const { connection: garminConnection, activities, syncActivities } = useGarmin();
  const { overdue, dueToday } = useReminders();
  const { unreadCount } = useNotifications();
  const [now, setNow] = useState<Date | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [briefErr, setBriefErr] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [habitSaving, setHabitSaving] = useState<Record<string, boolean>>({});
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const loadBrief = useCallback(async () => {
    setBriefRefreshing(true);
    try {
      const response = await fetch("/api/brief-json");
      if (!response.ok) throw new Error("Could not load the brief.");
      setBrief(await response.json());
      setBriefErr(false);
    } catch {
      setBriefErr(true);
    } finally {
      setBriefRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  useEffect(() => {
    if (garminConnection.connected) void syncActivities(0, 20);
  }, [garminConnection.connected, syncActivities]);

  useEffect(() => {
    setOptimistic({});
  }, [habits, now]);

  const todayHabits = now ? habits.filter((habit) => habitDue(habit, now)).slice(0, 3) : [];
  const hasTrainingToday = Boolean(now && activities.some((activity) => activity.startTimeLocal.slice(0, 10) === localDayOf(now)));
  const isTraining = (habit: (typeof todayHabits)[number]) => habit.name.trim().toLowerCase() === "training";
  const isAutoCompleted = (habit: (typeof todayHabits)[number]) => isTraining(habit) && hasTrainingToday;
  const isDone = (habit: (typeof todayHabits)[number]) =>
    isAutoCompleted(habit) || (habit.id in optimistic ? optimistic[habit.id] : Boolean(now && habitCompleted(habit, now)));

  const handleToggle = async (id: string, currentlyDone: boolean) => {
    if (habitSaving[id]) return;
    setHabitSaving((current) => ({ ...current, [id]: true }));
    setOptimistic((current) => ({ ...current, [id]: !currentlyDone }));
    if (!currentlyDone) {
      navigator.vibrate?.(10);
      const habit = habits.find((item) => item.id === id);
      if (habit) {
        const { streak } = scheduledToggle(habit);
        if (streak > 0 && streak % 7 === 0) setCelebrating(true);
      }
    }
    try {
      await toggleToday(id);
    } catch (error) {
      setOptimistic((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Could not save your completion.");
    } finally {
      setHabitSaving((current) => ({ ...current, [id]: false }));
    }
  };

  const unreadAlerts = unreadCount;
  const alertCount = unreadAlerts + overdue.length + dueToday.length;
  const cards = brief?.brief.cards ?? [];

  return (
    <Page narrow className="max-w-3xl">
      {celebrating && <Celebration onDone={() => setCelebrating(false)} />}
      <PageHeader
        title={
          <div>
            <span>Today</span>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              {now?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) ?? " "}
            </p>
          </div>
        }
        actions={alertCount > 0 ? (
          <Link href="/status" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] hover:bg-muted">
            <BellRing size={16} /> {alertCount} alerts
          </Link>
        ) : undefined}
      />

      {todayHabits.length > 0 && (
        <section aria-label="Habits" className="flex justify-center gap-2 overflow-x-auto py-1 sm:gap-8">
          {todayHabits.map((habit) => {
            const done = isDone(habit);
            return (
              <button
                key={habit.id}
                type="button"
                aria-label={isAutoCompleted(habit) ? `${habit.name} completed from Garmin activity` : `${done ? "Mark incomplete" : "Complete"} ${habit.name}; ${habit.streak} streak`}
                aria-pressed={done}
                disabled={habitSaving[habit.id] || isAutoCompleted(habit)}
                onClick={() => void handleToggle(habit.id, done)}
                className="flex min-h-11 min-w-24 flex-col items-center gap-1 rounded-xl px-2 py-1 text-center transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"
              >
                <span aria-hidden="true">
                  <ProgressRing value={done ? 1 : 0} goal={1} size={76} strokeWidth={6} label={done ? <Check size={16} /> : undefined} />
                </span>
                <span className="max-w-28 truncate text-xs font-medium text-foreground">{habit.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{streakText(habit, isAutoCompleted(habit))}</span>
              </button>
            );
          })}
        </section>
      )}

      <section aria-label="What needs attention" className="space-y-3">
        {briefErr && !brief && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <span>Couldn&apos;t load the brief.</span>
            <Button onClick={loadBrief} disabled={briefRefreshing} size="sm" variant="secondary" className="shrink-0 active:scale-[0.97]">
              <RotateCw size={14} className={briefRefreshing ? "animate-spin" : undefined} /> Retry
            </Button>
          </div>
        )}
        {!brief && !briefErr && (
          <div className="space-y-3" aria-label="Loading today">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}
        {brief && cards.length === 0 && (
          <EmptyState icon={Check} title="Nothing needs you" hint="Your day is clear." />
        )}
        {brief?.brief && cards.length > 0 && <BriefCards brief={brief.brief} compact maxCards={5} />}
      </section>

      <GoalsCard />
    </Page>
  );
}
