"use client";

import { useEffect, useState, useCallback } from "react";
import { Flame, Scale, TrendingUp } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import { Card } from "@/components/ui/card";
import { ProgressBar, SparkChart } from "@/components/charts";
import type { NutritionSettings } from "@/lib/nutrition-constants";
import { DEFAULT_NUTRITION_SETTINGS, BLOCKS_PER_DAY } from "@/lib/nutrition-constants";

interface BodyMeasurementDoc {
  date: string;
  weightKg?: number;
  consumedKcal?: number;
}

// Calories in and weight for the current eating block. Nothing is entered
// here: food is logged in MyFitnessPal, weigh-ins happen on the Garmin scale,
// and MFP syncs into Garmin, so this card is read-only by design. Adding a
// logging surface here would just be a third place to type the same numbers.
// Targets live in settings (users/local/settings/nutrition) — see
// nutrition-settings.ts; defaults below only cover the loading flash.

export function NutritionCard() {
  const { connection, nutrition, weighIn, syncNutrition } = useGarmin();
  const [settings, setSettings] = useState<NutritionSettings>(DEFAULT_NUTRITION_SETTINGS);
  const [history, setHistory] = useState<BodyMeasurementDoc[]>([]);
  const [blocksCompleted, setBlocksCompleted] = useState(0);

  useEffect(() => {
    if (connection.connected) syncNutrition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connected]);

  useEffect(() => {
    fetch("/api/nutrition-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data))
      .catch(() => {});
    fetch("/api/body-measurements?weeks=8")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setHistory(data.measurements ?? []))
      .catch(() => {});
    fetch("/api/daily-blocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setBlocksCompleted(data.blocksCompleted ?? 0))
      .catch(() => {});
  }, []);

  const setBlocks = useCallback((n: number) => {
    setBlocksCompleted(n);
    fetch("/api/daily-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocksCompleted: n }),
    }).catch(() => {});
  }, []);

  if (!connection.connected) return null;

  const { kcalTarget, weightTargetKg } = settings;
  const consumed = nutrition?.consumedKcal ?? null;
  const overBy = consumed != null ? consumed - kcalTarget : null;
  const toGo = weighIn ? Math.round((weighIn.weightKg - weightTargetKg) * 10) / 10 : null;
  const weightHistory = history.filter((m) => m.weightKg != null);

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
              {consumed} <span className="text-muted-foreground">/ {kcalTarget} kcal</span>
            </p>
            <span
              className={`shrink-0 font-mono text-[11px] ${
                overBy != null && overBy > 0 ? "text-amber-500" : "text-muted-foreground"
              }`}
            >
              {overBy != null && overBy > 0 ? `+${overBy}` : `${overBy} to go`}
            </span>
          </div>
          <ProgressBar value={consumed} max={kcalTarget} className="mt-2" />
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
                ? `${toGo} kg to ${weightTargetKg}`
                : `at or under ${weightTargetKg}`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No weigh-in today.</p>
        )}
      </div>

      {weightHistory.length >= 2 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp size={14} className="text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              8 weeks
            </span>
          </div>
          <SparkChart
            data={weightHistory}
            index="date"
            category="weightKg"
            referenceValue={weightTargetKg}
          />
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Daily blocks
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {blocksCompleted}/{BLOCKS_PER_DAY}
          </span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: BLOCKS_PER_DAY }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBlocks(blocksCompleted === n ? n - 1 : n)}
              aria-pressed={n <= blocksCompleted}
              aria-label={`block ${n}`}
              className={`h-6 flex-1 rounded-sm transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] ${
                n <= blocksCompleted ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
