"use client";

import Link from "next/link";
import { Activity, Check, GraduationCap } from "lucide-react";
import { useStrength } from "@/lib/use-strength";
import { weekOfBuild, sessionsThisWeek, buildComplete, targetFreq } from "@/lib/types";

export function StrengthCard() {
  const { building, maintaining, queued, loading, logSession } = useStrength();

  if (loading) return null;

  // Nothing set up yet — quiet prompt to open the page.
  if (!building && maintaining.length === 0) {
    return (
      <Link
        href="/strength"
        className="block rounded-xl p-4 lg:p-5 transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Activity size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Strength
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Set up your build-then-maintain plan →
        </p>
      </Link>
    );
  }

  const done = building ? sessionsThisWeek(building) : 0;
  const target = building ? targetFreq(building) : 0;
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const complete = building ? buildComplete(building) : false;

  return (
    <div
      className="rounded-xl p-4 lg:p-5"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Strength
          </h2>
        </div>
        <Link href="/strength" className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Open
        </Link>
      </div>

      {building ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {building.label}
            </p>
            <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
              Build · wk {weekOfBuild(building)}/{building.buildWeeks}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent)" }} />
            </div>
            <span className="text-xs font-mono shrink-0" style={{ color: "var(--accent)" }}>
              {done}/{target}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {complete ? (
              <Link
                href="/strength"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ color: "var(--accent)", background: "var(--accent-bg)" }}
              >
                <GraduationCap size={14} /> Ready to graduate
              </Link>
            ) : (
              <button
                onClick={() => logSession(building.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
              >
                <Check size={14} /> Log session
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          No active build — maintaining {maintaining.length}.
        </p>
      )}

      {(maintaining.length > 0 || queued.length > 0) && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {maintaining.length > 0 && `Maintaining: ${maintaining.map((f) => f.label).join(", ")}`}
          {maintaining.length > 0 && queued.length > 0 && " · "}
          {queued[0] && `Next: ${queued[0].label}`}
        </p>
      )}
    </div>
  );
}
