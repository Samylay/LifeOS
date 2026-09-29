"use client";

import { Flag } from "lucide-react";
import { ProgressBar } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { commitmentsForWeek, mondayOf, quarterOf } from "@/lib/types";
import { useGoals } from "@/lib/use-goals";

export function GoalsCard() {
  const { active, loading } = useGoals();
  if (loading) return null;

  const quarter = quarterOf();
  const week = mondayOf();
  const goals = active.filter((goal) => goal.quarter === quarter).slice(0, 3);

  return (
    <section aria-labelledby="quarter-goals-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <Flag size={16} className="text-primary" />
        <h2 id="quarter-goals-heading" className="section-label">Quarter goals</h2>
      </div>
      {goals.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No active objectives for {quarter}.</Card>
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
