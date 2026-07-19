"use client";

import Link from "next/link";
import { Flag, Circle, CheckCircle2 } from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { mondayOf, commitmentsForWeek, quarterOf } from "@/lib/types";
import { Card } from "@/components/ui/card";

export function GoalsCard() {
  const { active, loading, toggleCommitment } = useGoals();
  if (loading) return null;

  const week = mondayOf();
  // Prefer goals from the current quarter that have commitments this week.
  const quarter = quarterOf();
  const goal =
    active.find((g) => g.quarter === quarter && commitmentsForWeek(g, week).length > 0) ||
    active.find((g) => g.quarter === quarter) ||
    active[0];

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
                {commits.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCommitment(goal.id, c.id)}
                    className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted active:scale-[0.99] duration-150"
                  >
                    <span className={c.done ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground/70"}>
                      {c.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    </span>
                    <span
                      className={`text-sm flex-1 truncate text-foreground ${c.done ? "line-through opacity-60" : ""}`}
                    >
                      {c.text}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </Card>
  );
}
