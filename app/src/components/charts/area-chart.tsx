"use client";

import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { AXIS_TICK_STYLE, defaultValueFormatter, getColor, type ChartValueFormatter } from "./utils";

export interface AreaChartProps<T extends object = Record<string, string | number>> {
  data: T[];
  index: Extract<keyof T, string>;
  categories: Extract<keyof T, string>[];
  colors?: string[];
  valueFormatter?: ChartValueFormatter;
  showLegend?: boolean;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  className?: string;
}

/** Tremor-style area chart. Stacked-free multi-series with a subtle gradient fill. */
export function AreaChart<T extends object>({
  data,
  index,
  categories,
  colors,
  valueFormatter = defaultValueFormatter,
  showLegend = false,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  className,
}: AreaChartProps<T>) {
  const gradientId = `area-chart-gradient-${index}`;

  return (
    <div className={cn("h-80 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {categories.map((category, i) => {
              const color = getColor(colors, i);
              return (
                <linearGradient key={category} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid && (
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          )}
          {showXAxis && (
            <XAxis
              dataKey={index}
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
            />
          )}
          {showYAxis && (
            <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={36} />
          )}
          <Tooltip
            content={(props) => <ChartTooltip {...props} valueFormatter={valueFormatter} />}
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} iconType="circle" iconSize={8} />}
          {categories.map((category, i) => {
            const color = getColor(colors, i);
            return (
              <Area
                key={category}
                type="monotone"
                dataKey={category}
                stroke={color}
                fill={`url(#${gradientId}-${i})`}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
              />
            );
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
