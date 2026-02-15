"use client";

import { useMemo } from "react";
import { BarChart3, Timer, Flame, TrendingUp, Clock } from "lucide-react";
import { useFocusTimer } from "@/lib/use-focus";
import { useStreaks } from "@/lib/use-streaks";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6", career: "#6366F1", finance: "#F59E0B", brand: "#8B5CF6", admin: "#64748B",
};

function StatCard({ label, value, suffix, icon: Icon, color }: {
  label: string; value: string | number; suffix?: string;
  icon: typeof Timer; color: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span className="text-2xl font-bold font-mono" style={{ color }}>
        {value}{suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}

function BarGraph({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>{item.label}</span>
            <span className="text-xs font-mono" style={{ color: item.color }}>{item.value}m</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : "0%", background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FocusAnalyticsPage() {
  const { todaySessions } = useFocusTimer();
  const { streaks } = useStreaks();

  const analytics = useMemo(() => {
    const focusSessions = todaySessions.filter((s) => s.type === "focus");
    const completed = focusSessions.filter((s) => s.status === "completed");
    const partial = focusSessions.filter((s) => s.status === "partial");
    const abandoned = focusSessions.filter((s) => s.status === "abandoned");

    const totalFocusMinutes = completed.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const totalSessions = focusSessions.length;
    const completionRate = totalSessions > 0 ? Math.round((completed.length / totalSessions) * 100) : 0;
    const totalInterruptions = focusSessions.reduce((sum, s) => sum + (s.interruptions || 0), 0);
    const avgSessionMinutes = completed.length > 0
      ? Math.round(completed.reduce((sum, s) => sum + (s.actualDuration || 0), 0) / completed.length)
      : 0;

    const byArea = Object.keys(AREAS).reduce((acc, area) => {
      const areaSessions = completed.filter((s) => s.area === area);
      const minutes = areaSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
      acc[area as AreaId] = minutes;
      return acc;
    }, {} as Record<AreaId, number>);
    const unassigned = completed.filter((s) => !s.area).reduce((sum, s) => sum + (s.actualDuration || 0), 0);

    const byHour: Record<number, number> = {};
    completed.forEach((s) => {
      if (s.startedAt) {
        const hour = new Date(s.startedAt).getHours();
        byHour[hour] = (byHour[hour] || 0) + (s.actualDuration || 0);
      }
    });

    return {
      totalFocusMinutes,
      totalSessions,
      completedCount: completed.length,
      partialCount: partial.length,
      abandonedCount: abandoned.length,
      completionRate,
      totalInterruptions,
      avgSessionMinutes,
      byArea,
      unassigned,
      byHour,
    };
  }, [todaySessions]);

  const maxAreaMinutes = Math.max(...Object.values(analytics.byArea), analytics.unassigned, 1);

  const areaData = Object.entries(AREAS).map(([id, area]) => ({
    label: area.name,
    value: analytics.byArea[id as AreaId] || 0,
    color: AREA_COLORS[id] || "#64748B",
  }));
  if (analytics.unassigned > 0) {
    areaData.push({ label: "Unassigned", value: analytics.unassigned, color: "#64748B" });
  }

  const hourData = [];
  for (let h = 6; h <= 22; h++) {
    if (analytics.byHour[h]) {
      hourData.push({
        label: `${h}:00`,
        value: analytics.byHour[h],
        color: "var(--accent)",
      });
    }
  }
  const maxHourMinutes = Math.max(...hourData.map((h) => h.value), 1);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={24} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Focus Analytics</h1>
        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
          Today
        </span>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Focus Time" value={(analytics.totalFocusMinutes / 60).toFixed(1)} suffix="h" icon={Timer} color="var(--accent)" />
        <StatCard label="Sessions" value={`${analytics.completedCount}/${analytics.totalSessions}`} icon={Clock} color="#6366F1" />
        <StatCard label="Completion Rate" value={analytics.completionRate} suffix="%" icon={TrendingUp} color={analytics.completionRate >= 80 ? "#10B981" : "#F59E0B"} />
        <StatCard label="Focus Streak" value={streaks.focus.current} suffix=" days" icon={Flame} color="#F59E0B" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* By Area */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Focus by Area</h2>
          {areaData.every((d) => d.value === 0) ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>No focus sessions recorded today.</p>
          ) : (
            <BarGraph data={areaData.filter((d) => d.value > 0)} maxValue={maxAreaMinutes} />
          )}
        </div>

        {/* By Hour */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Focus by Hour</h2>
          {hourData.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>No focus sessions recorded today.</p>
          ) : (
            <BarGraph data={hourData} maxValue={maxHourMinutes} />
          )}
        </div>

        {/* Session Breakdown */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Session Breakdown</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Completed</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#10B981" }}>{analytics.completedCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Partial</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#F59E0B" }}>{analytics.partialCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Abandoned</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#EF4444" }}>{analytics.abandonedCount}</span>
            </div>
            <div className="border-t pt-3 flex justify-between items-center" style={{ borderColor: "var(--border-primary)" }}>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Avg. Session Length</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "var(--accent)" }}>{analytics.avgSessionMinutes}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Total Interruptions</span>
              <span className="text-sm font-mono font-semibold" style={{ color: analytics.totalInterruptions > 5 ? "#EF4444" : "var(--text-tertiary)" }}>{analytics.totalInterruptions}</span>
            </div>
          </div>
        </div>

        {/* Streaks */}
        <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Streak History</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Current Streak</span>
              <span className="text-sm font-mono font-semibold flex items-center gap-1" style={{ color: "#F59E0B" }}>
                <Flame size={14} /> {streaks.focus.current} days
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Longest Streak</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "var(--accent)" }}>{streaks.focus.longest} days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Last Active</span>
              <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{streaks.focus.lastActiveDate || "Never"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Shield Days Used</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-tertiary)" }}>{streaks.shieldDaysUsed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
