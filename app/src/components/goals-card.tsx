"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag, Circle, CheckCircle2 } from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { grillingTodosFor } from "@/lib/grilling";
import { mondayOf, commitmentsForWeek, quarterOf } from "@/lib/types";
import { Card } from "@/components/ui/card";

export function GoalsCard() {
  const { active, loading, toggleCommitment } = useGoals();
  // Optimistic overlay for commitment ticks — flips instantly, server catches
  // up (same pattern as the habits overlay on the Today page).
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  if (loading) return null;

  const isDone = (c: { id: string; done: boolean }) =>
    c.id in optimistic ? optimistic[c.id] : c.done;

  const week = mondayOf();
  // Prefer goals from the current quarter that have commitments this week.
  const quarter = quarterOf();
  const goal =
    active.find((g) => g.quarter === quarter && commitmentsForWeek(g, week).length > 0) ||
    active.find((g) => g.quarter === quarter) ||
    active[0];

  // T27: pending grilling sessions surface here (LifeOS-sourced), labelled,
  // never guilt-styled — they wait, they don't nag. decisions-needed.md stays
  // the separate source of truth until cutover; this list is additive.
  const grillingPending = grillingTodosFor(active);

  return (
    <Card className="gap-0 rounded-xl p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flag size={16} className="text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            This week
          </h2>
        </div>
        <Link href="/projects" className="text-[10px] font-bold uppercase tracking-wider text-primary">
          Goals
        </Link>
      </div>

      {!goal ? (
        <p className="text-sm text-muted-foreground/70">
          No active goal — <Link href="/projects" className="text-primary">set one</Link>.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium truncate text-foreground">{goal.title}</p>
          <p className="text-[11px] mb-2 text-muted-foreground/70">{goal.quarter}</p>
          {(() => {
            const commits = commitmentsForWeek(goal, week);
            if (commits.length === 0)
              return (
                <p className="text-sm text-muted-foreground/70">
                  No commitments yet — <Link href="/projects" className="text-primary">plan the week</Link>.
                </p>
              );
            return (
              <div className="space-y-1">
                {commits.slice(0, 4).map((c) => {
                  const done = isDone(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setOptimistic((o) => ({ ...o, [c.id]: !done }));
                        toggleCommitment(goal.id, c.id);
                      }}
                      className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:bg-muted active:scale-[0.99]"
                    >
                      <span className={done ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground/70"}>
                        {done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                      </span>
                      <span
                        className={`text-sm flex-1 truncate text-foreground ${done ? "line-through opacity-60" : ""}`}
                      >
                        {c.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {grillingPending.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5">
            Grilling session pending
          </p>
          <ul className="space-y-1">
            {grillingPending.slice(0, 3).map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle size={13} className="shrink-0 text-primary/60" />
                <Link href="/projects" className="truncate hover:text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-custom)]">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
