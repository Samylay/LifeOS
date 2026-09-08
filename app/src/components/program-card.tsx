"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Loader2, Minus, Plus, Undo2 } from "lucide-react";
import { useProgram } from "@/lib/use-program";
import { PROGRAM_DAY_ORDER, PROGRAM_DAY_LABEL } from "@/lib/types";
import type { ProgramDay, ProgramExercise } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { logExercises, remainingExercisesForToday } from "@/lib/program-logging";

function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function todayProgramDay(now: Date = new Date()): ProgramDay {
  return PROGRAM_DAY_ORDER[(now.getDay() + 6) % 7];
}

const btnGhost =
  "flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground transition-transform duration-150 active:scale-90";
const btnPrimary =
  "flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97]";
const btnTab =
  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-transform duration-150";

function ExerciseRow({
  ex,
  busy,
  onAdjustWeight,
  onLog,
  onUndo,
}: {
  ex: ProgramExercise;
  busy: boolean;
  onAdjustWeight: (id: string, delta: number) => void;
  onLog: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const weight = ex.currentWeightKg;
  const last = ex.history.length > 0 ? ex.history[ex.history.length - 1] : null;

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{ex.name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {ex.sets}×{ex.targetReps}
          {ex.repsSuffix ?? ""}
          {last && (
            <span className="ml-2 text-muted-foreground/70">
              last {daysSince(last.date) === 0 ? "today" : `${daysSince(last.date)}d ago`}
            </span>
          )}
        </p>
      </div>

      {weight !== null && (
        <div className="flex shrink-0 items-center gap-1">
          <button className={btnGhost} onClick={() => onAdjustWeight(ex.id, -2.5)} disabled={busy} aria-label={`Reduce ${ex.name} by 2.5 kg`} title="-2.5kg">
            <Minus size={12} />
          </button>
          <span className="w-12 text-center font-mono text-xs">{weight}kg</span>
          <button className={btnGhost} onClick={() => onAdjustWeight(ex.id, 2.5)} disabled={busy} aria-label={`Increase ${ex.name} by 2.5 kg`} title="+2.5kg">
            <Plus size={12} />
          </button>
        </div>
      )}

      <button onClick={() => onLog(ex.id)} disabled={busy} className={btnPrimary} aria-label={`Log ${ex.name} for today`} title="Log today's session">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      {ex.history.length > 0 && (
        <button onClick={() => onUndo(ex.id)} disabled={busy} className={btnGhost} aria-label={`Undo last ${ex.name} log`} title="Undo last log">
          <Undo2 size={11} />
        </button>
      )}
    </li>
  );
}

export function ProgramCard() {
  const { exercises, loading, byDay, seedDefaults, adjustWeight, logSession, undoLastLog } = useProgram();
  const { toast } = useToast();
  const [activeDay, setActiveDay] = useState<ProgramDay>(todayProgramDay());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const [loggingRemaining, setLoggingRemaining] = useState(false);
  // State gives visual feedback. Refs are the actual lock, because two taps
  // can happen before React has rendered the disabled button.
  const busyRef = useRef(new Set<string>());
  const loggingRemainingRef = useRef(false);

  const dayExercises = useMemo(() => byDay(activeDay), [byDay, activeDay]);
  const daysWithWork = useMemo(
    () => PROGRAM_DAY_ORDER.filter((d) => exercises.some((e) => e.day === d)),
    [exercises]
  );
  const isToday = activeDay === todayProgramDay();
  const remainingToday = useMemo(() => remainingExercisesForToday(dayExercises), [dayExercises]);

  const withExerciseBusy = async (id: string, action: () => Promise<unknown> | undefined) => {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    try {
      await action();
    } catch {
      toast("Couldn’t update that exercise.", "error");
    } finally {
      busyRef.current.delete(id);
      setBusyIds(new Set(busyRef.current));
    }
  };

  const logRemaining = async () => {
    if (loggingRemainingRef.current || remainingToday.length === 0) return;
    const requested = remainingToday.filter((ex) => !busyRef.current.has(ex.id));
    if (requested.length === 0) return;
    loggingRemainingRef.current = true;
    setLoggingRemaining(true);
    requested.forEach((ex) => busyRef.current.add(ex.id));
    setBusyIds(new Set(busyRef.current));
    try {
      const { loggedIds, failedIds } = await logExercises(requested, logSession);
      if (loggedIds.length > 0) {
        toast(`Logged ${loggedIds.length} exercise${loggedIds.length === 1 ? "" : "s"} for today.`, "success");
      }
      if (failedIds.length > 0) {
        toast(`${failedIds.length} exercise${failedIds.length === 1 ? "" : "s"} didn’t log. Check those rows.`, "error");
      }
    } catch {
      toast("Couldn’t log the program. Check the rows below.", "error");
    } finally {
      loggingRemainingRef.current = false;
      setLoggingRemaining(false);
      requested.forEach((ex) => busyRef.current.delete(ex.id));
      setBusyIds(new Set(busyRef.current));
    }
  };

  const seed = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      await seedDefaults();
    } catch {
      toast("Couldn’t load the program.", "error");
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 lg:p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          <h2 className="section-label">Program</h2>
        </div>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="mt-3 h-32 w-full" />
      </Card>
    );
  }

  if (exercises.length === 0) {
    return (
      <Card className="p-4 lg:p-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          <h2 className="section-label">Program</h2>
        </div>
        <EmptyState
          compact
          icon={CalendarDays}
          hint="No weekly program set up."
          action={
            <button onClick={() => void seed()} disabled={seeding} className={btnPrimary}>
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {seeding ? "Loading plan…" : "Load PPLPPL plan"}
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          <h2 className="section-label">Program</h2>
        </div>
        {isToday && remainingToday.length > 0 && (
          <button onClick={() => void logRemaining()} disabled={loggingRemaining || busyIds.size > 0} className={btnPrimary}>
            {loggingRemaining ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Log {remainingToday.length} remaining
          </button>
        )}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {daysWithWork.map((d) => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={`${btnTab} ${
              activeDay === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {PROGRAM_DAY_LABEL[d].slice(0, 3)}
          </button>
        ))}
      </div>

      {dayExercises.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Rest day.</p>
      ) : (
        <>
          <p className="mt-2 text-xs font-medium text-primary">{dayExercises[0].dayLabel}</p>
          <ul className="divide-y divide-border">
            {dayExercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                ex={ex}
                busy={busyIds.has(ex.id)}
                onAdjustWeight={(id, delta) => void withExerciseBusy(id, () => adjustWeight(id, delta))}
                onLog={(id) => void withExerciseBusy(id, () => logSession(id))}
                onUndo={(id) => void withExerciseBusy(id, () => undoLastLog(id))}
              />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
