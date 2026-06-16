"use client";

import Link from "next/link";
import { Flag, Circle, CheckCircle2 } from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { mondayOf, commitmentsForWeek, quarterOf } from "@/lib/types";

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
    <div
      className="rounded-xl p-4 lg:p-5"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flag size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            This week
          </h2>
        </div>
        <Link href="/goals" className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Goals
        </Link>
      </div>

      {!goal ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          No active goal — <Link href="/goals" style={{ color: "var(--accent)" }}>set one</Link>.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{goal.title}</p>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>{goal.quarter}</p>
          {(() => {
            const commits = commitmentsForWeek(goal, week);
            if (commits.length === 0)
              return (
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  No commitments yet — <Link href="/goals" style={{ color: "var(--accent)" }}>plan the week</Link>.
                </p>
              );
            return (
              <div className="space-y-1">
                {commits.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCommitment(goal.id, c.id)}
                    className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--bg-tertiary)]"
                  >
                    <span className="shrink-0" style={{ color: c.done ? "var(--accent)" : "var(--text-tertiary)" }}>
                      {c.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)", textDecoration: c.done ? "line-through" : "none", opacity: c.done ? 0.6 : 1 }}>
                      {c.text}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
