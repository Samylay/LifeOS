"use client";

import { cn } from "@/lib/utils";
import { getColor, type ChartValueFormatter } from "./utils";

export interface CategoryBarSegment {
  label: string;
  value: number;
}

export interface CategoryBarProps {
  data: CategoryBarSegment[];
  colors?: string[];
  showLegend?: boolean;
  valueFormatter?: ChartValueFormatter;
  className?: string;
}

/** Segmented horizontal bar (share-of-total), with an optional swatch legend. */
export function CategoryBar({ data, colors, showLegend = false, valueFormatter, className }: CategoryBarProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {data.map((segment, i) => {
          const width = (segment.value / total) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={segment.label}
              style={{ width: `${width}%`, background: getColor(colors, i) }}
              title={valueFormatter ? `${segment.label}: ${valueFormatter(segment.value)}` : segment.label}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {data.map((segment, i) => (
            <span key={segment.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: getColor(colors, i) }}
                aria-hidden
              />
              {segment.label}
              {valueFormatter && (
                <span className="tabular-nums text-foreground">{valueFormatter(segment.value)}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
