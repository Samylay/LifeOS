"use client";

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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
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

function cardStyle(): React.CSSProperties {
  return { background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
      {children}
    </h2>
  );
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color = diff > 0 ? "#7C9E8A" : diff < 0 ? "#C97A6A" : "var(--text-tertiary)";
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-mono" style={{ color }}>
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

  const rows = activities || [];

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
      <div className="rounded-xl p-8 text-center" style={cardStyle()}>
        <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading training data...</p>
      </div>
    );
  }

  if (unconfigured) {
    return (
      <div className="rounded-xl p-8 text-center" style={cardStyle()}>
        <Activity size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
        <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          Strava isn&apos;t connected yet
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Connect Strava in Settings to see your training analytics here.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={cardStyle()}>
        <Activity size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
        <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          No activities synced yet
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync Strava
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / sync */}
      <div className="flex items-center justify-end -mt-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 text-xs" style={{ background: "var(--bg-tertiary)", color: "#C97A6A" }}>
          {error}
        </div>
      )}

      {/* 1. This week */}
      <section>
        <SectionLabel>This Week</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SPORT_ORDER.filter((s) => s !== "other" || thisWeekTotals.other.count > 0 || lastWeekTotals.other.count > 0).map((sport) => {
            const Icon = SPORT_ICONS[sport];
            const cur = thisWeekTotals[sport];
            const prev = lastWeekTotals[sport];
            return (
              <div key={sport} className="rounded-xl p-4" style={cardStyle()}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} style={{ color: SPORT_COLORS[sport] }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                      {SPORT_LABELS[sport]}
                    </span>
                  </div>
                  <DeltaBadge current={cur.moving_time_s} previous={prev.moving_time_s} />
                </div>
                {cur.count === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No activity</p>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                      {sport === "other" ? formatDuration(cur.moving_time_s) : formatDistance(cur.distance_m)}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {formatDuration(cur.moving_time_s)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {cur.count}x
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Weekly trend */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Weekly Trend (12 weeks)</SectionLabel>
          <div className="flex gap-1 text-xs">
            {(["hours", "km"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTrendMetric(m)}
                className="px-2 py-1 rounded-full transition-colors"
                style={{
                  background: trendMetric === m ? "var(--accent)" : "var(--bg-tertiary)",
                  color: trendMetric === m ? "white" : "var(--text-secondary)",
                }}
              >
                {m === "hours" ? "Hours" : "Km"}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-4" style={cardStyle()}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                axisLine={{ stroke: "var(--border-primary)" }}
                tickLine={false}
                interval={1}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                formatter={(value, name) => [
                  trendMetric === "hours" ? `${Number(value).toFixed(1)} h` : `${Number(value).toFixed(1)} km`,
                  SPORT_LABELS[name as SportBucket] ?? String(name),
                ]}
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                formatter={(value) => SPORT_LABELS[value as SportBucket] ?? value}
                wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }}
              />
              <Bar dataKey="run" stackId="a" fill={SPORT_COLORS.run} radius={[0, 0, 0, 0]} />
              <Bar dataKey="ride" stackId="a" fill={SPORT_COLORS.ride} radius={[0, 0, 0, 0]} />
              <Bar dataKey="swim" stackId="a" fill={SPORT_COLORS.swim} radius={[0, 0, 0, 0]} />
              <Bar dataKey="other" stackId="a" fill={SPORT_COLORS.other} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3. Sport breakdown (this year) */}
      <section>
        <SectionLabel>This Year</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={cardStyle()}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Sport
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Count
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Distance
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Time
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--text-tertiary)" }}>
                  Elevation
                </th>
              </tr>
            </thead>
            <tbody>
              {SPORT_ORDER.filter((s) => yearTotals[s].count > 0).map((sport) => {
                const Icon = SPORT_ICONS[sport];
                const t = yearTotals[sport];
                return (
                  <tr key={sport} style={{ borderBottom: "1px solid var(--border-secondary)" }}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        <Icon size={14} style={{ color: SPORT_COLORS[sport] }} />
                        {SPORT_LABELS[sport]}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
                      {t.count}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
                      {formatDistance(t.distance_m)}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
                      {formatDuration(t.moving_time_s)}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-sm hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>
                      {Math.round(t.elevation_m)} m
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <div key={r.id} className="rounded-xl p-3 flex items-center gap-3" style={cardStyle()}>
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 32, height: 32, background: `${SPORT_COLORS[sport]}1A` }}
                >
                  <Icon size={16} style={{ color: SPORT_COLORS[sport] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {r.name}
                    </span>
                    <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                      {activityDate(r).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {r.distance_m > 0 && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        {formatKm(r.distance_m)} km
                      </span>
                    )}
                    <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {formatDuration(r.moving_time_s)}
                    </span>
                    {pace && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        {pace}
                      </span>
                    )}
                    {r.average_heartrate ? (
                      <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#C97A6A" }}>
                        <Heart size={10} />
                        {Math.round(r.average_heartrate)}
                      </span>
                    ) : null}
                    {r.average_watts ? (
                      <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                        <Zap size={10} />
                        {Math.round(r.average_watts)}W
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Records */}
      <section>
        <SectionLabel>Records</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              icon={<Mountain size={16} style={{ color: "var(--accent)" }} />}
              label="Biggest Climbing Day"
              value={`${Math.round(records.biggestClimb.elevation_m)} m`}
              sub={records.biggestClimb.row.name}
            />
          )}
          {records.longestWeek && (
            <RecordCard
              icon={<CalendarRange size={16} style={{ color: "var(--text-secondary)" }} />}
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
    <div className="rounded-xl p-4" style={cardStyle()}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </span>
      </div>
      <p className="text-lg font-bold font-mono mb-0.5" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
      <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
        {sub}
      </p>
    </div>
  );
}
