"use client";

import { Activity, Check, GraduationCap, Plus, Undo2 } from "lucide-react";
import { useStrength } from "@/lib/use-strength";
import { weekOfBuild, sessionsThisWeek, buildComplete, targetFreq } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";

// Days since a logged session, for a quiet "last: 3d ago" readout.
function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

const btnPrimary =
  "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97]";
const btnGhost =
  "flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.97]";

export function StrengthCard() {
  const {
    building, maintaining, queued, loading,
    logSession, undoLastSession, graduate, seedDefaults,
  } = useStrength();

  if (loading) {
    return (
      <Card className="p-4 lg:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="section-label">Strength</h2>
        </div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-2 w-full" />
        <Skeleton className="mt-3 h-16 w-full" />
      </Card>
    );
  }

  // Nothing set up yet — offer to seed the default build-then-maintain queue.
  if (!building && maintaining.length === 0 && queued.length === 0) {
    return (
      <Card className="p-4 lg:p-5">
        <div className="mb-1 flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="section-label">Strength</h2>
        </div>
        <EmptyState
          compact
          icon={Activity}
          hint="No active build-then-maintain focus."
          action={
            <button onClick={() => seedDefaults()} className={btnPrimary}>
              <Plus size={14} /> Set up focus queue
            </button>
          }
        />
      </Card>
    );
  }

  const done = building ? sessionsThisWeek(building) : 0;
  const target = building ? targetFreq(building) : 0;
  const complete = building ? buildComplete(building) : false;
  const lastBuildingSession = building && building.log.length > 0
    ? building.log[building.log.length - 1].date
    : null;

  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="section-label">Strength</h2>
        </div>
      </div>

      {/* Build phase — one active focus at a time */}
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

          {lastBuildingSession && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              Last session{" "}
              {daysSince(lastBuildingSession) === 0
                ? "today"
                : `${daysSince(lastBuildingSession)}d ago`}
            </p>
          )}

          {building.exercises.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {building.exercises.map((ex) => (
                <li key={ex} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">•</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            {complete ? (
              <button onClick={() => graduate(building.id)} className={btnPrimary}>
                <GraduationCap size={14} /> Graduate — start the next focus
              </button>
            ) : (
              <button onClick={() => logSession(building.id)} className={btnPrimary}>
                <Check size={14} /> Log session
              </button>
            )}
            {building.log.length > 0 && (
              <button
                onClick={() => undoLastSession(building.id)}
                className={btnGhost}
                title="Remove the most recent logged session"
              >
                <Undo2 size={12} /> Undo
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No active build.</p>
      )}

      {/* Maintain phases — still loggable; maintenance is real training */}
      {maintaining.map((f) => {
        const mDone = sessionsThisWeek(f);
        const mTarget = targetFreq(f);
        const last = f.log.length > 0 ? f.log[f.log.length - 1].date : null;
        return (
          <div key={f.id} className="mt-4 border-t border-border pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">{f.label}</p>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                Maintain · {mDone}/{mTarget} this wk
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={mDone} max={mTarget} className="flex-1" color="var(--muted-foreground)" />
              <button onClick={() => logSession(f.id)} className={btnGhost}>
                <Check size={12} /> Log
              </button>
              {f.log.length > 0 && (
                <button onClick={() => undoLastSession(f.id)} className={btnGhost} title="Undo last logged session">
                  <Undo2 size={12} />
                </button>
              )}
            </div>
            {last && (
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Last {daysSince(last) === 0 ? "today" : `${daysSince(last)}d ago`}
              </p>
            )}
          </div>
        );
      })}

      {(maintaining.length > 0 || queued.length > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {queued[0] && (
            <>
              Next: {queued[0].label}
              {queued[0].note && ` — ${queued[0].note}`}
            </>
          )}
        </p>
      )}
    </Card>
  );
}
