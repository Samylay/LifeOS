"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { defaultValueFormatter, getColor, type ChartValueFormatter } from "./utils";

export interface DonutChartProps<T extends object = Record<string, string | number>> {
  data: T[];
  category: Extract<keyof T, string>;
  index: Extract<keyof T, string>;
  colors?: string[];
  valueFormatter?: ChartValueFormatter;
  /** Override the centered total label; defaults to the formatted sum. */
  label?: string;
  showLabel?: boolean;
  className?: string;
}

/** Tremor-style donut chart with an optional centered total label. */
export function DonutChart<T extends object>({
  data,
  category,
  index,
  colors,
  valueFormatter = defaultValueFormatter,
  label,
  showLabel = true,
  className,
}: DonutChartProps<T>) {
  const total = useMemo(
    () => data.reduce((sum, d) => sum + (Number(d[category]) || 0), 0),
    [data, category]
  );
  const centerLabel = label ?? valueFormatter(total);

  return (
    <div className={cn("relative h-48 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={(props) => <ChartTooltip {...props} valueFormatter={valueFormatter} />}
          />
          <Pie
            data={data}
            dataKey={category}
            nameKey={index}
            innerRadius="65%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell key={`${entry[index]}-${i}`} fill={getColor(colors, i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {showLabel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{centerLabel}</span>
        </div>
      )}
    </div>
  );
}
