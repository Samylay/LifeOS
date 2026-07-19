"use client";

import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { cn } from "@/lib/utils";
import { type ChartValueFormatter, defaultValueFormatter } from "./utils";

export interface ChartTooltipProps extends TooltipContentProps<ValueType, NameType> {
  valueFormatter?: ChartValueFormatter;
  className?: string;
}

/** Shared recharts tooltip content — pass as `content={(p) => <ChartTooltip {...p} />}`. */
export function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter = defaultValueFormatter,
  className,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className={cn(
        "min-w-32 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
        className
      )}
    >
      {label !== undefined && label !== null && label !== "" && (
        <div className="mb-1 font-medium">{String(label)}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => {
          const color = (entry.color ?? entry.stroke ?? entry.fill) as string | undefined;
          const numeric = typeof entry.value === "number" ? entry.value : Number(entry.value);
          const formatted = Number.isNaN(numeric) ? String(entry.value) : valueFormatter(numeric);
          return (
            <div key={`${entry.dataKey ?? entry.name ?? i}`} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto font-medium tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
