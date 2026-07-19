"use client";

import { Activity, Check, GraduationCap } from "lucide-react";
import { useStrength } from "@/lib/use-strength";
import { weekOfBuild, sessionsThisWeek, buildComplete, targetFreq } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";

export function StrengthCard() {
  const { building, maintaining, queued, loading, logSession } = useStrength();

  if (loading) return null;

  // Nothing set up yet — stay quiet (strength is a light-touch focus tracker).
  if (!building && maintaining.length === 0) {
    return (
      <Card className="p-4 lg:p-5">
        <div className="mb-1 flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Strength
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">No active build-then-maintain focus.</p>
      </Card>
    );
  }

  const done = building ? sessionsThisWeek(building) : 0;
  const target = building ? targetFreq(building) : 0;
  const complete = building ? buildComplete(building) : false;

  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Strength
          </h2>
        </div>
      </div>

      {building ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">{building.label}</p>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              Build · wk {weekOfBuild(building)}/{building.buildWeeks}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={done} max={target} className="flex-1" color="var(--primary)" />
            <span className="shrink-0 font-mono text-xs text-primary">
              {done}/{target}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {complete ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                <GraduationCap size={14} /> Ready to graduate
              </span>
            ) : (
              <button
                onClick={() => logSession(building.id)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97]"
              >
                <Check size={14} /> Log session
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No active build — maintaining {maintaining.length}.
        </p>
      )}

      {(maintaining.length > 0 || queued.length > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {maintaining.length > 0 && `Maintaining: ${maintaining.map((f) => f.label).join(", ")}`}
          {maintaining.length > 0 && queued.length > 0 && " · "}
          {queued[0] && `Next: ${queued[0].label}`}
        </p>
      )}
    </Card>
  );
}
