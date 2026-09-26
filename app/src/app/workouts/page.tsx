"use client";

import { PreparedMaterials } from "@/components/workflows/workflow-links";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, CalendarDays, Activity, Utensils } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import TrainingAnalytics from "@/components/training-analytics";
import { StrengthCard } from "@/components/strength-card";
import { ProgramCard } from "@/components/program-card";
import { NutritionCard } from "@/components/nutrition-card";
import { FlowSelector } from "@/components/workspace/visual-navigation";
import { Page, PageHeader } from "@/components/ui/page";

export default function TrainingPage() {
  const garmin = useGarmin();
  const [view, setView] = useState("program");

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
        title="Training"
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

      <PreparedMaterials />
      <FlowSelector label="Training view" value={view} onChange={setView} options={[
        { id: "program", label: "Your program", icon: CalendarDays },
        { id: "activity", label: "Activity", icon: Activity },
        { id: "strength", label: "Strength", icon: Dumbbell },
        { id: "nutrition", label: "Nutrition", icon: Utensils },
      ]} />
      <section hidden={view !== "program"} aria-label="Weekly training program"><ProgramCard /></section>
      <section hidden={view !== "activity"} aria-label="Activity and recovery"><TrainingAnalytics /></section>
      <section hidden={view !== "strength"} aria-label="Strength training"><StrengthCard /></section>
      <section hidden={view !== "nutrition"} aria-label="Nutrition">
        <NutritionCard />
        {!garmin.connection.connected && <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Connect Garmin in Settings to see nutrition and weight.</p>}
        <Link href="/recipes" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm pressable active:scale-[0.97]"><Utensils size={16} /> Choose a recipe →</Link>
      </section>
    </Page>
  );
}
