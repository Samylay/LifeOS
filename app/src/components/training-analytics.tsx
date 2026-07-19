"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/charts";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bike,
  Waves,
  Footprints,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Mountain,
  CalendarRange,
  Heart,
  Zap,
} from "lucide-react";
import {
  type ActivityRow,
  type SportBucket,
  mapSport,
  SPORT_LABELS,
  SPORT_COLORS,
  formatDuration,
  formatDistance,
  formatKm,
  formatPaceForSport,
  totalsBySport,
  weeklyTrend,
  computeRecords,
  isoWeekStart,
  activityDate,
} from "./training-stats";
import TrainingInsights from "./training-insights";

const SPORT_ICONS: Record<SportBucket, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  swim: Waves,
  ride: Bike,
  run: Footprints,
  other: Activity,
};

const SPORT_ORDER: SportBucket[] = ["run", "ride", "swim", "other"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-mono ${color}`}>
      <Icon size={11} />
      {previous > 0 ? `${Math.abs(pct).toFixed(0)}%` : "new"}
    </span>
  );
}

export default function TrainingAnalytics() {
  const [activities, setActivities] = useState<ActivityRow[] | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [trendMetric, setTrendMetric] = useState<"hours" | "km">("hours");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const after = new Date();
      after.setMonth(after.getMonth() - 13); // ~13 months covers 12-week trend + this-year breakdown safely
      after.setDate(1);
      const res = await fetch(`/api/strava/activities?after=${after.toISOString()}&limit=600`);
      const data = await res.json();
      if (!data.ok) {
        setUnconfigured(true);
        setActivities([]);
        return;
      }
      setUnconfigured(false);
      setActivities(data.activities || []);
    } catch {
      setError("Failed to load activities.");
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/strava/sync", { method: "POST" });
      await load();
    } catch {
      setError("Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const rows = useMemo(() => activities || [], [activities]);

  // --- This week vs last week ---
  const { thisWeekRows, lastWeekRows } = useMemo(() => {
    const now = new Date();
    const thisWeekStart = isoWeekStart(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const thisWeekRows: ActivityRow[] = [];
    const lastWeekRows: ActivityRow[] = [];
    for (const r of rows) {
      const d = activityDate(r);
      if (d >= thisWeekStart) thisWeekRows.push(r);
      else if (d >= lastWeekStart && d < thisWeekStart) lastWeekRows.push(r);
    }
    return { thisWeekRows, lastWeekRows };
  }, [rows]);

  const thisWeekTotals = useMemo(() => totalsBySport(thisWeekRows), [thisWeekRows]);
  const lastWeekTotals = useMemo(() => totalsBySport(lastWeekRows), [lastWeekRows]);

  // --- Weekly trend (12 weeks) ---
  const trendData = useMemo(
    () => weeklyTrend(rows, 12, trendMetric === "km" ? "distance_m" : "moving_time_s"),
    [rows, trendMetric]
  );

  // --- This year breakdown ---
  const yearTotals = useMemo(() => {
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const yearRows = rows.filter((r) => activityDate(r) >= yearStart);
    return totalsBySport(yearRows);
  }, [rows]);

  // --- Recent activities (last 20) ---
  const recent = useMemo(() => rows.slice(0, 20), [rows]);

  // --- Records ---
  const records = useMemo(() => computeRecords(rows), [rows]);

  if (loading) {
    return (
      <div className="space-y-6">
        <section>
          <SectionLabel>This Week</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (unconfigured) {
    return (
      <Card className="p-8 text-center">
        <Activity size={32} className="mx-auto mb-3 text-muted-foreground" />
        <p className="mb-1 text-sm font-medium">Strava isn&apos;t connected yet</p>
        <p className="text-xs text-muted-foreground">
          Connect Strava in Settings to see your training analytics here.
        </p>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Activity size={32} className="mx-auto mb-3 text-muted-foreground" />
        <p className="mb-2 text-sm font-medium">No activities synced yet</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync Strava
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / sync */}
      <div className="-mt-2 flex items-center justify-end">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:opacity-80"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-muted p-3 text-xs text-destructive">{error}</div>
      )}

      {/* 1. This week */}
      <section>
        <SectionLabel>This Week</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SPORT_ORDER.filter((s) => s !== "other" || thisWeekTotals.other.count > 0 || lastWeekTotals.other.count > 0).map((sport) => {
            const Icon = SPORT_ICONS[sport];
            const cur = thisWeekTotals[sport];
            const prev = lastWeekTotals[sport];
            return (
              <Card key={sport} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={16} style={{ color: SPORT_COLORS[sport] }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {SPORT_LABELS[sport]}
                    </span>
                  </div>
                  <DeltaBadge current={cur.moving_time_s} previous={prev.moving_time_s} />
                </div>
                {cur.count === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity</p>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xl font-bold">
                      {sport === "other" ? formatDuration(cur.moving_time_s) : formatDistance(cur.distance_m)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/90">
                      {formatDuration(cur.moving_time_s)}
                    </span>
                    <span className="text-xs text-muted-foreground">{cur.count}x</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* 2. Weekly trend */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Weekly Trend (12 weeks)</SectionLabel>
          <div className="flex gap-1 text-xs">
            {(["hours", "km"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTrendMetric(m)}
                className={`rounded-full px-2 py-1 transition-colors ${
                  trendMetric === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {m === "hours" ? "Hours" : "Km"}
              </button>
            ))}
          </div>
        </div>
        <Card className="p-4">
          <BarChart
            data={trendData}
            index="label"
            categories={SPORT_ORDER}
            colors={SPORT_ORDER.map((s) => SPORT_COLORS[s])}
            categoryLabels={SPORT_LABELS}
            stacked
            showLegend
            valueFormatter={(v) => (trendMetric === "hours" ? `${v.toFixed(1)} h` : `${v.toFixed(1)} km`)}
            className="h-[220px]"
          />
        </Card>
      </section>

      {/* 3. Sport breakdown (this year) */}
      <section>
        <SectionLabel>This Year</SectionLabel>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sport
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Count
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Distance
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Time
                </th>
                <th className="hidden px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">
                  Elevation
                </th>
              </tr>
            </thead>
            <tbody>
              {SPORT_ORDER.filter((s) => yearTotals[s].count > 0).map((sport) => {
                const Icon = SPORT_ICONS[sport];
                const t = yearTotals[sport];
                return (
                  <tr key={sport} className="border-b border-border/60">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icon size={14} style={{ color: SPORT_COLORS[sport] }} />
                        {SPORT_LABELS[sport]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-muted-foreground">
                      {t.count}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-muted-foreground">
                      {formatDistance(t.distance_m)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-muted-foreground">
                      {formatDuration(t.moving_time_s)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right font-mono text-sm text-muted-foreground sm:table-cell">
                      {Math.round(t.elevation_m)} m
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      {/* 4. Recent activities */}
      <section>
        <SectionLabel>Recent Activities</SectionLabel>
        <div className="space-y-2">
          {recent.map((r) => {
            const sport = mapSport(r.sport_type);
            const Icon = SPORT_ICONS[sport];
            const pace = formatPaceForSport(sport, r.average_speed_mps);
            return (
              <Card key={r.id} className="flex flex-row items-center gap-3 p-3">
                <div
                  className="flex shrink-0 items-center justify-center rounded-lg"
                  style={{ width: 32, height: 32, background: `${SPORT_COLORS[sport]}1A` }}
                >
                  <Icon size={16} style={{ color: SPORT_COLORS[sport] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {activityDate(r).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {r.distance_m > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{formatKm(r.distance_m)} km</span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{formatDuration(r.moving_time_s)}</span>
                    {pace && <span className="font-mono text-xs text-muted-foreground">{pace}</span>}
                    {r.average_heartrate ? (
                      <span className="flex items-center gap-1 font-mono text-xs text-destructive">
                        <Heart size={10} />
                        {Math.round(r.average_heartrate)}
                      </span>
                    ) : null}
                    {r.average_watts ? (
                      <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                        <Zap size={10} />
                        {Math.round(r.average_watts)}W
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 5. Records */}
      <section>
        <SectionLabel>Records</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {records.longestRun && (
            <RecordCard
              icon={<Footprints size={16} style={{ color: SPORT_COLORS.run }} />}
              label="Longest Run"
              value={formatDistance(records.longestRun.distance_m)}
              sub={records.longestRun.row.name}
            />
          )}
          {records.longestRide && (
            <RecordCard
              icon={<Bike size={16} style={{ color: SPORT_COLORS.ride }} />}
              label="Longest Ride"
              value={formatDistance(records.longestRide.distance_m)}
              sub={records.longestRide.row.name}
            />
          )}
          {records.longestSwim && (
            <RecordCard
              icon={<Waves size={16} style={{ color: SPORT_COLORS.swim }} />}
              label="Longest Swim"
              value={formatDistance(records.longestSwim.distance_m)}
              sub={records.longestSwim.row.name}
            />
          )}
          {records.fastest5k && (
            <RecordCard
              icon={<Trophy size={16} style={{ color: "#D4A24E" }} />}
              label="Fastest 5k+ Pace"
              value={formatPaceForSport("run", records.fastest5k.speed_mps) || "--"}
              sub={records.fastest5k.row.name}
            />
          )}
          {records.biggestClimb && records.biggestClimb.elevation_m > 0 && (
            <RecordCard
              icon={<Mountain size={16} className="text-primary" />}
              label="Biggest Climbing Day"
              value={`${Math.round(records.biggestClimb.elevation_m)} m`}
              sub={records.biggestClimb.row.name}
            />
          )}
          {records.longestWeek && (
            <RecordCard
              icon={<CalendarRange size={16} className="text-muted-foreground" />}
              label="Longest Week (Distance)"
              value={formatDistance(records.longestWeek.distance_m)}
              sub={`Week of ${new Date(records.longestWeek.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            />
          )}
        </div>
      </section>

      {/* 6-7. Compare + distributions (ported from strava-dashboard) */}
      <TrainingInsights rows={rows} />
    </div>
  );
}

function RecordCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mb-0.5 font-mono text-lg font-bold">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}
