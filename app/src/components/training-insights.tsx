"use client";

import { useMemo } from "react";
import { Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/charts";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
  const color = pct > 0 ? "text-emerald-500" : pct < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-mono ${color}`}>
      <Icon size={11} />
      {hasPrev ? `${Math.abs(pct).toFixed(0)}%` : "new"}
    </span>
  );
}

function Histogram({ bins, color, unit }: { bins: { label: string; count: number }[]; color: string; unit: string }) {
  return (
    <BarChart
      data={bins}
      index="label"
      categories={["count"]}
      colors={[color]}
      categoryLabels={{ count: unit }}
      valueFormatter={(v) => `${v} activities`}
      showYAxis
      className="h-40"
    />
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
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Last 30 Days vs Previous</SectionLabel>
          {streak > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-mono text-amber-500"
              title="Consecutive days with an activity"
            >
              <Flame size={12} />
              {streak}-day streak
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {compare.map(({ key, label, fmt, r }) => (
            <Card key={key} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
                <DeltaPct pct={r.deltaPct} hasPrev={r.bTotal > 0} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xl font-bold">{fmt(r.aTotal)}</span>
                <span className="font-mono text-xs text-muted-foreground">vs {fmt(r.bTotal)}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Distributions */}
      {(paceBins.length > 0 || hrBins.length > 0) && (
        <section>
          <SectionLabel>Distributions</SectionLabel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {paceBins.length > 0 && (
              <Card className="p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Run pace (min/km)</p>
                <Histogram bins={paceBins} color={SPORT_COLORS.run} unit="pace bucket" />
              </Card>
            )}
            {hrBins.length > 0 && (
              <Card className="p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Avg heart rate (bpm)</p>
                <Histogram bins={hrBins} color="var(--destructive)" unit="HR bucket" />
              </Card>
            )}
          </div>
        </section>
      )}
    </>
  );
}
