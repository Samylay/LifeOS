"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import TrainingAnalytics from "@/components/training-analytics";
import { StrengthCard } from "@/components/strength-card";
import { ProgramCard } from "@/components/program-card";
import { NutritionCard } from "@/components/nutrition-card";
import { Page, PageHeader } from "@/components/ui/page";

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
    <Page className="max-w-5xl">
      <PageHeader
        kicker="Health"
        title="Training"
        description="Recovery, nutrition, and the training load that informs today."
        icon={Dumbbell}
      />

      {garmin.error && (
        <div className="enter rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Garmin session expired —{" "}
          <Link href="/settings" className="text-primary underline underline-offset-2">
            reconnect in Settings
          </Link>
          .
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

      {/* Weekly PPLPPL program — per-exercise weight tracking */}
      <div className="enter" style={{ ["--enter-delay" as string]: "120ms" }}>
        <ProgramCard />
      </div>
    </Page>
  );
}
