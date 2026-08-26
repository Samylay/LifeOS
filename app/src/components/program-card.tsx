"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Minus, Plus, Undo2 } from "lucide-react";
import { useProgram } from "@/lib/use-program";
import { PROGRAM_DAY_ORDER, PROGRAM_DAY_LABEL, lastLoggedWeight } from "@/lib/types";
import type { ProgramDay, ProgramExercise } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";

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
  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150";

function ExerciseRow({ ex }: { ex: ProgramExercise }) {
  const { adjustWeight, logSession, undoLastLog } = useProgram();
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
          <button className={btnGhost} onClick={() => adjustWeight(ex.id, -2.5)} title="-2.5kg">
            <Minus size={12} />
          </button>
          <span className="w-12 text-center font-mono text-xs">{weight}kg</span>
          <button className={btnGhost} onClick={() => adjustWeight(ex.id, 2.5)} title="+2.5kg">
            <Plus size={12} />
          </button>
        </div>
      )}

      <button onClick={() => logSession(ex.id)} className={btnPrimary} title="Log today's session">
        <Check size={12} />
      </button>
      {ex.history.length > 0 && (
        <button onClick={() => undoLastLog(ex.id)} className={btnGhost} title="Undo last log">
          <Undo2 size={11} />
        </button>
      )}
    </li>
  );
}

export function ProgramCard() {
  const { exercises, loading, byDay, seedDefaults } = useProgram();
  const [activeDay, setActiveDay] = useState<ProgramDay>(todayProgramDay());

  const dayExercises = useMemo(() => byDay(activeDay), [byDay, activeDay]);
  const daysWithWork = useMemo(
    () => PROGRAM_DAY_ORDER.filter((d) => exercises.some((e) => e.day === d)),
    [exercises]
  );

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
            <button onClick={() => seedDefaults()} className={btnPrimary}>
              <Plus size={14} /> Load PPLPPL plan
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays size={16} className="text-primary" />
        <h2 className="section-label">Program</h2>
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
              <ExerciseRow key={ex.id} ex={ex} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
