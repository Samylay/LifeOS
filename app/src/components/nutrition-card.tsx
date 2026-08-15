"use client";

import { useEffect } from "react";
import { Flame, Scale } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";

// Calories in and weight for the current eating block. Nothing is entered
// here: food is logged in MyFitnessPal, weigh-ins happen on the Garmin scale,
// and MFP syncs into Garmin, so this card is read-only by design. Adding a
// logging surface here would just be a third place to type the same numbers.

// Set by the Aug–Dec 2026 block: a ~300 kcal deficit, not 400, because the
// governing constraint is "sessions frequent, never tired". Do not tighten
// these without Samy saying so. T82 moves them into settings.
const KCAL_TARGET = 2450;
const WEIGHT_TARGET_KG = 79;

export function NutritionCard() {
  const { connection, nutrition, weighIn, syncNutrition } = useGarmin();

  useEffect(() => {
    if (connection.connected) syncNutrition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connected]);

  if (!connection.connected) return null;

  const consumed = nutrition?.consumedKcal ?? null;
  const overBy = consumed != null ? consumed - KCAL_TARGET : null;
  const toGo = weighIn ? Math.round((weighIn.weightKg - WEIGHT_TARGET_KG) * 10) / 10 : null;

  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={16} className="text-primary" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Today
        </h2>
      </div>

      {consumed != null ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium tabular-nums">
              {consumed} <span className="text-muted-foreground">/ {KCAL_TARGET} kcal</span>
            </p>
            <span
              className={`shrink-0 font-mono text-[11px] ${
                overBy != null && overBy > 0 ? "text-amber-500" : "text-muted-foreground"
              }`}
            >
              {overBy != null && overBy > 0 ? `+${overBy}` : `${overBy} to go`}
            </span>
          </div>
          <ProgressBar value={consumed} max={KCAL_TARGET} className="mt-2" />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing logged in MyFitnessPal today.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <Scale size={14} className="text-muted-foreground" />
        {weighIn ? (
          <p className="text-sm tabular-nums">
            {weighIn.weightKg} kg
            <span className="ml-2 text-muted-foreground">
              {toGo != null && toGo > 0
                ? `${toGo} kg to ${WEIGHT_TARGET_KG}`
                : `at or under ${WEIGHT_TARGET_KG}`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No weigh-in today.</p>
        )}
      </div>
    </Card>
  );
}
