"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { AXIS_TICK_STYLE,
  GRID_STROKE,
  defaultValueFormatter,
  getColor, type ChartValueFormatter } from "./utils";

export interface BarChartProps<T extends object = Record<string, string | number>> {
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
  /** Stack all categories into one bar per index value (default: grouped side-by-side). */
  stacked?: boolean;
  /** Display name per category key, used for the legend + tooltip rows. */
  categoryLabels?: Record<string, string>;
  /** Compact currency or unit formatter for the value axis. */
  axisValueFormatter?: ChartValueFormatter;
  /** Called when the user selects a bar. */
  onDatumClick?: (datum: T) => void;
  /** Highlight one data point across every series. */
  selectedIndex?: number;
}

/** Tremor-style bar chart, grouped or stacked multi-series. */
export function BarChart<T extends object>({
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
  stacked = false,
  categoryLabels,
  axisValueFormatter,
  onDatumClick,
  selectedIndex,
}: BarChartProps<T>) {
  return (
    <div className={cn("h-80 w-full min-w-0", className)}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsBarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          )}
          {showXAxis && (
            <XAxis dataKey={index} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          )}
          {showYAxis && (
            <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={axisValueFormatter ? 58 : 36} allowDecimals={false} tickFormatter={axisValueFormatter} />
          )}
          <Tooltip
            content={(props) => <ChartTooltip {...props} valueFormatter={valueFormatter} />}
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} iconType="circle" iconSize={8} />}
          {categories.map((category, i) => {
            const color = getColor(colors, i);
            const isLast = i === categories.length - 1;
            const radius: [number, number, number, number] =
              stacked && !isLast ? [0, 0, 0, 0] : [6, 6, 0, 0];
            return (
              <Bar
                key={category}
                dataKey={category}
                name={categoryLabels?.[category] ?? category}
                fill={color}
                stackId={stacked ? "stack" : undefined}
                radius={radius}
                isAnimationActive={false}
                maxBarSize={32}
                onClick={onDatumClick ? (rectangle) => {
                  if (rectangle.payload && typeof rectangle.payload === "object") onDatumClick(rectangle.payload as T);
                } : undefined}
              >
                {(selectedIndex !== undefined || onDatumClick) && data.map((_, dataIndex) => (
                  <Cell
                    key={`${category}-${dataIndex}`}
                    fill={color}
                    opacity={selectedIndex === undefined || selectedIndex === dataIndex ? 1 : 0.42}
                    style={onDatumClick ? { cursor: "pointer", transition: "opacity 150ms var(--ease-out-custom)" } : undefined}
                  />
                ))}
              </Bar>
            );
          })}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
