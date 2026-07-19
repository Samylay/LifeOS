"use client";

import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface KpiCardDelta {
  value: string;
  direction: "up" | "down" | "flat";
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: KpiCardDelta;
  icon?: ReactNode;
  /** Slot for a <SparkChart /> or similar, rendered under the value. */
  sparkline?: ReactNode;
  className?: string;
}

const DELTA_ICON: Record<KpiCardDelta["direction"], typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const DELTA_COLOR: Record<KpiCardDelta["direction"], string> = {
  up: "text-emerald-500",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

/** Dense Card-based stat tile — label, big value, optional delta + sparkline. */
export function KpiCard({ label, value, delta, icon, sparkline, className }: KpiCardProps) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;

  return (
    <Card className={cn("gap-1.5 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </span>
        {delta && DeltaIcon && (
          <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums", DELTA_COLOR[delta.direction])}>
            <DeltaIcon size={11} />
            {delta.value}
          </span>
        )}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {sparkline && <div className="mt-1">{sparkline}</div>}
    </Card>
  );
}
