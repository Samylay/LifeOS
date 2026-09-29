"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bike, CalendarDays, ChevronDown, Footprints, RefreshCw, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { LineChart, ProgressRing, SparkChart } from "@/components/charts";
import { SectionHeader } from "@/components/ui/page";
import { TrainingPlanCard } from "@/components/training-plan-card";
import { useCollection } from "@/lib/use-collection";
import { localDate, PLAN_START, PLAN_WEEKS, PACE_SEC_PER_KM, sessionsForWeek, type Session } from "@/lib/training-plan";
import { activityLoad, trainingLoadHistory, type TrainingLoadPoint } from "@/lib/training-load";
import { activityDate, formatDuration, formatPaceForSport, mapSport, type ActivityRow, type SportBucket } from "@/components/training-stats";

// Vichy 70.3 is provisional: the vault plan says "Sept 2027", no day fixed
// yet (club decision in December 2026). Update when the entry is confirmed.
const VICHY_RACE_DATE = "2027-09-01";
const RACE_DAY = Date.parse(`${VICHY_RACE_DATE}T00:00:00Z`);
const SPORT_META: Record<Exclude<SportBucket, "other">, { label: string; icon: LucideIcon; color: string }> = {
  swim: { label: "Swim", icon: Waves, color: "var(--chart-1)" },
  ride: { label: "Bike", icon: Bike, color: "var(--chart-2)" },
  run: { label: "Run", icon: Footprints, color: "var(--chart-3)" },
};
const PLAN_DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const LOAD_DAYS = 90;

interface BodyMeasurement extends Record<string, unknown> {
  id: string;
  date?: string;
  weightKg?: number;
}

function parseLocalDay(activity: ActivityRow): string {
  return (activity.start_date_local || activity.start_date).slice(0, 10);
}

function minutesForRun(session: Session): number {
  if (!session.run) return 0;
  const seconds = session.run.blocks.reduce((total, block) => total + block.times * block.steps.reduce((sum, step) => {
    if (step.seconds) return sum + step.seconds;
    if (!step.meters) return sum;
    const pace = step.zone === "none" ? PACE_SEC_PER_KM.easy[0] : PACE_SEC_PER_KM[step.zone][0];
    return sum + (step.meters / 1000) * pace;
  }, 0), 0);
  return Math.round(seconds / 60);
}

function plannedSession(date: string): Session | null {
  if (date < PLAN_START) return null;
  const offset = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${PLAN_START}T00:00:00Z`)) / 86_400_000);
  const week = Math.floor(offset / 7) + 1;
  if (week > PLAN_WEEKS) return null;
  return sessionsForWeek(week)[offset % 7];
}

function formState(tsb: number): { label: string; className: string } {
  if (tsb < -30) return { label: "Overreaching", className: "text-destructive" };
  if (tsb < -10) return { label: "Tired", className: "text-warning" };
  if (tsb > 10) return { label: "Fresh", className: "text-success" };
  return { label: "Neutral", className: "text-muted-foreground" };
}

function LoadingDashboard() {
  return <div className="space-y-5" aria-label="Loading training dashboard">
    <Skeleton className="h-48" />
    <Skeleton className="h-64" />
    <Skeleton className="h-40" />
  </div>;
}

export function TrainingDashboard() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const { items: measurements, loading: measurementsLoading } = useCollection<BodyMeasurement>("bodyMeasurements", {
    orderByField: "date", orderDir: "asc", fallbackDates: [],
  });

  const loadActivities = async () => {
    setLoading(true);
    setError(null);
    try {
      const after = new Date();
      after.setDate(after.getDate() - 460);
      const response = await fetch(`/api/strava/activities?after=${after.toISOString()}&limit=600`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setConfigured(false);
        setActivities([]);
        return;
      }
      setConfigured(true);
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch {
      setError("Could not load Strava activities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadActivities(); }, []);

  const history = useMemo(() => trainingLoadHistory(activities, new Date(), LOAD_DAYS), [activities]);
  const currentForm = history.at(-1)?.tsb ?? 0;
  const form = formState(currentForm);
  const today = localDate();
  const daysToRace = Math.ceil((RACE_DAY - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const thisWeekStart = useMemo(() => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  }, [today]);
  const thisWeekKey = thisWeekStart.toISOString().slice(0, 10);
  const weekActivities = activities.filter((activity) => parseLocalDay(activity) >= thisWeekKey && parseLocalDay(activity) <= today);
  const volumeBySport = useMemo(() => {
    const totals = { swim: 0, ride: 0, run: 0 };
    for (const row of weekActivities) {
      const sport = mapSport(row.sport_type);
      if (sport !== "other") totals[sport] += row.moving_time_s / 60;
    }
    return totals;
  }, [weekActivities]);
  const runPlanMinutes = useMemo(() => {
    let total = 0;
    for (let day = 0; day < 7; day++) {
      const date = new Date(thisWeekStart.getTime() + day * 86_400_000).toISOString().slice(0, 10);
      const session = plannedSession(date);
      if (session?.kind === "run") total += minutesForRun(session);
    }
    return total;
  }, [thisWeekStart]);

  const calendarDays = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const date = new Date(thisWeekStart.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    const planned = plannedSession(date);
    const done = activities.some((activity) => parseLocalDay(activity) === date && (
      planned?.kind === "run" ? mapSport(activity.sport_type) === "run"
        : planned?.kind === "gym" ? /weight|strength|workout/i.test(activity.sport_type)
          : planned?.kind === "mobility" ? /yoga|workout/i.test(activity.sport_type)
            : false
    ));
    const past = date < today;
    return { date, day: PLAN_DAYS[index % 7], session: planned, done, past };
  }), [activities, thisWeekStart, today]);

  const recent = activities.slice(0, visibleCount);
  const effortMax = Math.max(1, ...activities.slice(0, 30).map(activityLoad));
  const weightHistory = measurements.filter((item) => Number.isFinite(item.weightKg) && item.date).slice(-90)
    .map((item) => ({ date: item.date!, weight: item.weightKg! }));
  const raceDateLabel = "Vichy 70.3 · Sept 2027, provisional";

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/strava/sync", { method: "POST" });
      if (!response.ok) throw new Error("Sync failed");
      await loadActivities();
    } catch {
      setError("Strava sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingDashboard />;

  return <div className="space-y-6">
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <span>{error}</span><button onClick={() => void loadActivities()} className="active:scale-[0.97]">Retry</button>
    </div>}

    {!configured && <Card className="p-4"><EmptyState icon={Activity} title="Strava is not connected" hint="Connect Strava in Settings to see actual training and fitness trends." /></Card>}

    <section aria-label="Race readiness" className="grid gap-3 sm:grid-cols-[1.1fr_1.4fr_1fr]">
      <Card className="flex min-h-36 flex-col justify-between p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Days to Vichy 70.3</span>
        <div><span className="font-mono text-4xl font-bold tabular-nums">~{daysToRace}</span><p className="mt-1 text-sm text-muted-foreground">{raceDateLabel}</p></div>
      </Card>
      <Card className="p-4">
        <div className="mb-3"><SectionHeader title="This week · volume vs plan" /></div>
        <div className="grid grid-cols-3 justify-items-center gap-1">
          {(["swim", "ride", "run"] as const).map((sport) => {
            const meta = SPORT_META[sport];
            const Icon = meta.icon;
            const goal = sport === "run" ? runPlanMinutes : 0;
            const value = Math.round(volumeBySport[sport]);
            const ringValue = goal > 0 ? value : 0;
            return <div key={sport} className="flex min-w-0 flex-col items-center gap-1">
              <ProgressRing value={ringValue} goal={goal} size={90} strokeWidth={6} color={meta.color} label={goal > 0 ? "min" : "no plan"} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Icon size={13} />{meta.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{value} / {goal || "—"} min</span>
            </div>;
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">The saved plan has run sessions only. Swim and bike targets are not configured.</p>
      </Card>
      <Card className="flex min-h-36 flex-col justify-between p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current form · TSB</span>
        <div><span className={`font-mono text-4xl font-bold tabular-nums ${form.className}`}>{Math.round(currentForm)}</span><p className={`mt-1 text-sm ${form.className}`}>{form.label}</p></div>
      </Card>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between gap-2"><SectionHeader title="Fitness · fatigue · form" />
        <button type="button" onClick={() => void sync()} disabled={syncing || !configured} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />Sync
        </button>
      </div>
      <Card className="p-3 sm:p-4">
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>CTL <b className="text-foreground">42d</b></span><span>ATL <b className="text-foreground">7d</b></span><span>TSB uses yesterday&apos;s CTL − ATL</span></div>
        <LineChart data={history as TrainingLoadPoint[]} index="date" categories={["ctl", "atl", "tsb"]} colors={["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]} showLegend showYAxis={false} className="h-64" valueFormatter={(value) => `${Math.round(value)} load`} />
      </Card>
    </section>

    <section>
      <SectionHeader title="Plan vs actual · 4 weeks" />
      <Card className="mt-3 p-3">
        <div className="grid grid-cols-7 gap-x-1 gap-y-2 sm:grid-cols-14 lg:grid-cols-28">
          {calendarDays.map(({ date, day, session, done, past }) => <div key={date} className="flex min-w-0 flex-col items-center gap-1" title={`${date}${session ? ` · ${session.title}` : " · no planned session"}${done ? " · done" : ""}`}>
            <span className="text-[10px] text-muted-foreground">{day}</span>
            <span aria-label={session ? `${session.title}, ${done ? "done" : past ? "missed" : "planned"}` : "No planned session"} className={`h-2.5 w-2.5 rounded-full ${!session ? "bg-muted" : done ? "bg-success" : past ? "bg-destructive/70" : "border border-primary bg-primary/15"}`} />
            <span className="w-full truncate text-center text-[9px] text-muted-foreground">{session?.kind === "run" ? "Run" : session?.kind === "gym" ? "Gym" : session?.kind === "mobility" ? "Move" : ""}</span>
            <span className="font-mono text-[9px] text-muted-foreground">{date.slice(8)}</span>
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-2 text-[10px] text-muted-foreground"><span><i className="mr-1 inline-block h-2 w-2 rounded-full border border-primary" />planned</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />done</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive/70" />missed</span></div>
      </Card>
    </section>

    <section>
      <SectionHeader title="Recent activities" />
      {!activities.length ? <Card className="mt-3 p-4"><EmptyState compact icon={Activity} hint="Activities will appear after your first Strava sync." /></Card> : <Card className="mt-3 divide-y divide-border p-0">
        {recent.map((row) => {
          const sport = mapSport(row.sport_type);
          const meta = sport !== "other" ? SPORT_META[sport] : { label: "Activity", icon: Activity, color: "var(--muted-foreground)" };
          const Icon = meta.icon;
          const effort = Math.round(activityLoad(row));
          const speed = formatPaceForSport(sport, row.average_speed_mps);
          return <div key={row.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted" style={{ color: meta.color }}><Icon size={17} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{new Date(activityDate(row)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {row.distance_m ? `${(row.distance_m / 1000).toFixed(1)} km` : meta.label} · {formatDuration(row.moving_time_s)}{speed ? ` · ${speed}` : ""}</p></div>
            <div className="w-14 shrink-0"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${Math.min(1, effort / effortMax)})` }} /></div><span className="mt-1 block text-right font-mono text-[10px] text-muted-foreground">RE {effort}</span></div>
          </div>;
        })}
        {visibleCount < Math.min(activities.length, 30) && <button type="button" onClick={() => setVisibleCount((count) => Math.min(30, count + 10))} className="flex min-h-11 w-full items-center justify-center gap-1 text-sm text-primary transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">Show more <ChevronDown size={15} /></button>}
      </Card>}
    </section>

    <section>
      <SectionHeader title="Body weight" />
      <Card className="mt-3 flex items-center gap-4 p-4">
        {measurementsLoading ? <Skeleton className="h-10 w-full" /> : weightHistory.length >= 2 ? <>
          <div className="shrink-0"><span className="font-mono text-2xl font-semibold">{weightHistory.at(-1)?.weight.toFixed(1)} kg</span><p className="text-xs text-muted-foreground">Garmin · {weightHistory.length} weigh-ins</p></div>
          <SparkChart data={weightHistory} index="date" category="weight" className="h-12 flex-1" color="var(--chart-2)" />
        </> : <EmptyState compact icon={CalendarDays} hint="Garmin weight history will appear when measurements are available." />}
      </Card>
    </section>

    <details className="group rounded-xl border border-border bg-card p-4">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>Training plan details</span><ChevronDown size={16} className="transition-transform duration-200 ease-[var(--ease-out-custom)] group-open:rotate-180" />
      </summary>
      <div className="mt-4"><TrainingPlanCard /></div>
    </details>
  </div>;
}
