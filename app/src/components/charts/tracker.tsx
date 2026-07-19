"use client";

import { cn } from "@/lib/utils";

export interface TrackerDatum {
  color: string;
  tooltip?: string;
  key?: string | number;
}

export interface TrackerProps {
  data: TrackerDatum[];
  className?: string;
}

/** Row of small rounded rects, one per item, colored + titled individually (Tremor Tracker). */
export function Tracker({ data, className }: TrackerProps) {
  return (
    <div className={cn("flex w-full items-center gap-0.5", className)}>
      {data.map((item, i) => (
        <div
          key={item.key ?? i}
          title={item.tooltip}
          className="h-8 w-1 flex-1 rounded-full"
          style={{ background: item.color }}
        />
      ))}
    </div>
  );
}
