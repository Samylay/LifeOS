"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { AXIS_TICK_STYLE, defaultValueFormatter, getColor, type ChartValueFormatter } from "./utils";

export interface LineChartProps<T extends object = Record<string, string | number>> {
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

/** Tremor-style line chart, multi-series. */
export function LineChart<T extends object>({
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
}: LineChartProps<T>) {
  return (
    <div className={cn("h-80 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          )}
          {showXAxis && (
            <XAxis dataKey={index} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
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
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                stroke={color}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
