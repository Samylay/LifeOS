"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { ProgressRing } from "@/components/charts";
import { foodDate } from "@/lib/food-model";
import { PROTEIN_TARGET_G } from "@/lib/nutrition-constants";

type Summary = { mealCount: number; totals: Record<string, { value: number | null }> };

// Today's logged food at a glance, with a one-tap route to the camera.
export function FoodTodayCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const query = new URLSearchParams({ date: foodDate(new Date().toISOString(), timezone), timezone });
    void fetch(`/api/nutrition-log?${query}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, []);
  const protein = Math.round(summary?.totals.protein?.value ?? 0);
  const kcal = Math.round(summary?.totals.kcal?.value ?? 0);
  const meals = summary?.mealCount ?? 0;
  return <section aria-label="Food today" className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
    <span aria-hidden="true"><ProgressRing value={protein} goal={PROTEIN_TARGET_G} size={56} strokeWidth={5} label={<span className="text-xs font-semibold tabular-nums">{protein}</span>} /></span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">Food today</p>
      <p className="truncate text-xs tabular-nums text-muted-foreground">{meals ? `${kcal} kcal · ${protein} / ${PROTEIN_TARGET_G} g protein` : "Nothing logged yet"}</p>
    </div>
    <Link href="/chat?camera=1" aria-label="Log a meal with the camera" className="flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><Camera size={16} />Log a meal</Link>
  </section>;
}
