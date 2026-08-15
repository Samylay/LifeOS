"use client";

import { useEffect } from "react";
import { Dumbbell } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import TrainingAnalytics from "@/components/training-analytics";
import { StrengthCard } from "@/components/strength-card";
import { NutritionCard } from "@/components/nutrition-card";

export default function TrainingPage() {
  const garmin = useGarmin();

  // Probe Garmin on mount: the workout list itself comes from Strava (below),
  // but this keeps HR/sleep syncing warm and detects an expired session.
  useEffect(() => {
    if (garmin.connection.connected) {
      garmin.syncActivities(0, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin.connection.connected]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="enter flex items-center gap-3">
        <Dumbbell size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold">Training</h1>
      </div>

      {garmin.error && (
        <div className="enter rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Garmin session expired — reconnect in Settings.
        </div>
      )}

      {/* Calories in (MyFitnessPal → Garmin) and the day's weigh-in */}
      <div className="enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <NutritionCard />
      </div>

      {/* Analytics (Strava) */}
      <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
        <TrainingAnalytics />
      </div>

      {/* Strength focus (folded in from the retired /strength route) */}
      <div className="enter" style={{ ["--enter-delay" as string]: "90ms" }}>
        <StrengthCard />
      </div>
    </div>
  );
}
