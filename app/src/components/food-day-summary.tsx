"use client";
import { useEffect, useState } from "react";
import { foodDate, type FoodPhoto } from "@/lib/food-model";

export function FoodDaySummary({ photos }: { photos: FoodPhoto[] }) {
  const [summary, setSummary] = useState<{ mealCount: number; totals: Record<string, { value: number | null }> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const query = new URLSearchParams({ date: foodDate(new Date().toISOString(), timezone), timezone });
    void fetch(`/api/nutrition-log?${query}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, [photos]);
  if (!summary?.mealCount) return null;
  return <div className="border-b border-border/70 px-1 py-2 text-xs sm:px-4" aria-label="Today's logged nutrition">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-medium">Today · {summary.mealCount} {summary.mealCount === 1 ? "meal" : "meals"}</span>{[["kcal", "kcal"], ["protein", "g protein"], ["carbs", "g carbs"], ["fat", "g fat"]].map(([key, unit]) => <span key={key} className="tabular-nums text-muted-foreground">{summary.totals[key]?.value == null ? `Unknown ${key}` : `${key === "kcal" ? Math.round(summary.totals[key].value!) : Math.round(summary.totals[key].value! * 10) / 10} ${unit}`}</span>)}</div>
    <p className="mt-1 text-[10px] text-muted-foreground">Estimated totals from logged meals only</p>
  </div>;
}
