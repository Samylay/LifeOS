"use client";

import { useMemo } from "react";
import { Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  currentStreak,
  comparePeriods,
  paceHistogram,
  hrHistogram,
  type BucketKey,
} from "@/lib/training/stats";
import { type ActivityRow, mapSport, SPORT_COLORS, formatDuration, formatKm, activityDate } from "./training-stats";

// Sections ported from the retired ~/dashboards/strava-dashboard (compare +
// distributions views), rendered below TrainingAnalytics' own sections.
// Heatmap and per-activity map/streams deliberately not ported (Samy's call).

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

const COMPARE_METRICS: { key: BucketKey; label: string; fmt: (n: number) => string }[] = [
  { key: "distance_m", label: "Distance", fmt: (n) => `${formatKm(n)} km` },
  { key: "moving_time_s", label: "Time", fmt: (n) => formatDuration(n) },
  { key: "count", label: "Activities", fmt: (n) => `${n}` },
];

function DeltaPct({ pct, hasPrev }: { pct: number; hasPrev: boolean }) {
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const color = pct > 0 ? "#7C9E8A" : pct < 0 ? "#C97A6A" : "var(--text-tertiary)";
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-mono" style={{ color }}>
      <Icon size={11} />
      {hasPrev ? `${Math.abs(pct).toFixed(0)}%` : "new"}
    </span>
  );
}

function Histogram({ bins, color, unit }: { bins: { label: string; count: number }[]; color: string; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={bins} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
          axisLine={{ stroke: "var(--border-primary)" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [`${value} activities`, unit]}
          contentStyle={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function TrainingInsights({ rows }: { rows: ActivityRow[] }) {
  const streak = useMemo(() => currentStreak(rows), [rows]);

  // Last 30 days vs the 30 before, per metric.
  const compare = useMemo(() => {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86400 * 1000);
    const d60 = new Date(now.getTime() - 60 * 86400 * 1000);
    const a: ActivityRow[] = [];
    const b: ActivityRow[] = [];
    for (const r of rows) {
      const d = activityDate(r);
      if (d >= d30) a.push(r);
      else if (d >= d60) b.push(r);
    }
    return COMPARE_METRICS.map((m) => ({ ...m, r: comparePeriods(a, b, m.key) }));
  }, [rows]);

  // Distributions: run pace histogram + all-activity HR histogram.
  const paceBins = useMemo(() => {
    const runRows = rows
      .filter((r) => mapSport(r.sport_type) === "run")
      .map((r) => ({ ...r, sport_type: "Run" }));
    return paceHistogram(runRows, "Run");
  }, [rows]);
  const hrBins = useMemo(() => hrHistogram(rows), [rows]);

  return (
    <>
      {/* Last 30 days vs previous 30 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Last 30 Days vs Previous</SectionLabel>
          {streak > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono"
              style={{ background: "var(--bg-tertiary)", color: "#D4A24E" }}
              title="Consecutive days with an activity"
            >
              <Flame size={12} />
              {streak}-day streak
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {compare.map(({ key, label, fmt, r }) => (
            <div key={key} className="rounded-xl p-4" style={cardStyle()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {label}
                </span>
                <DeltaPct pct={r.deltaPct} hasPrev={r.bTotal > 0} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  {fmt(r.aTotal)}
                </span>
                <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                  vs {fmt(r.bTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Distributions */}
      {(paceBins.length > 0 || hrBins.length > 0) && (
        <section>
          <SectionLabel>Distributions</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {paceBins.length > 0 && (
              <div className="rounded-xl p-4" style={cardStyle()}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Run pace (min/km)
                </p>
                <Histogram bins={paceBins} color={SPORT_COLORS.run} unit="pace bucket" />
              </div>
            )}
            {hrBins.length > 0 && (
              <div className="rounded-xl p-4" style={cardStyle()}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Avg heart rate (bpm)
                </p>
                <Histogram bins={hrBins} color="#C97A6A" unit="HR bucket" />
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
