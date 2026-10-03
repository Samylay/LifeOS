"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { commitmentsForWeek, mondayOf, quarterOf } from "@/lib/types";
import { useGoals } from "@/lib/use-goals";

export function GoalsCard() {
  const { active, loading, createGoal } = useGoals();
  const [carrying, setCarrying] = useState(false);
  if (loading) return null;

  const quarter = quarterOf();
  const week = mondayOf();
  const goals = active.filter((goal) => goal.quarter === quarter).slice(0, 3);
  const earlier = active.filter((goal) => goal.quarter < quarter).slice(0, 3);

  async function carryOver() {
    setCarrying(true);
    try {
      for (const goal of earlier) await createGoal({ title: goal.title, why: goal.why, outcome: goal.outcome, quarter });
      toast.success(`Carried ${earlier.length} into ${quarter}`);
    } catch {
      toast.error("Could not carry the goals over");
    } finally {
      setCarrying(false);
    }
  }

  return (
    <section aria-labelledby="quarter-goals-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <Flag size={16} className="text-primary" />
        <h2 id="quarter-goals-heading" className="section-label">Quarter goals</h2>
      </div>
      {goals.length === 0 ? (
        <Card className="gap-3 p-4 text-sm text-muted-foreground">
          <p>No objectives for {quarter} yet.</p>
          {earlier.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => void carryOver()} disabled={carrying} className="active:scale-[0.97]">Carry over {earlier.length} from {earlier[0].quarter}</Button>
              <span className="text-xs">{earlier.map((goal) => goal.title).join(" · ")}</span>
            </div>
          ) : (
            <Link href="/chat" className="inline-flex min-h-11 items-center text-primary underline underline-offset-2">Ask the Assistant to set one</Link>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => {
            const commitments = commitmentsForWeek(goal, week);
            const complete = commitments.filter((commitment) => commitment.done).length;
            return (
              <Card key={goal.id} className="gap-2 p-4">
                <p className="text-sm font-medium text-foreground">{goal.title}</p>
                {commitments.length > 0 ? (
                  <ProgressBar value={complete} max={commitments.length} label="This week" showValue valueFormatter={(value, max) => `${value}/${max}`} />
                ) : (
                  <p className="text-xs text-muted-foreground">No weekly commitments.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
