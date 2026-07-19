"use client";

import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

export interface SparkChartProps<T extends object = Record<string, string | number>> {
  data: T[];
  index: Extract<keyof T, string>;
  category: Extract<keyof T, string>;
  color?: string;
  type?: "area" | "line";
  className?: string;
}

/** Tiny inline chart for table rows/dense contexts — no axes, no tooltip, fixed h-8. */
export function SparkChart<T extends object>({
  data,
  index,
  category,
  color = "var(--chart-1)",
  type = "area",
  className,
}: SparkChartProps<T>) {
  return (
    <div className={cn("h-8 w-full min-w-16", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "area" ? (
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-gradient-${index}-${category}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={category}
              stroke={color}
              fill={`url(#spark-gradient-${index}-${category})`}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey={category}
              stroke={color}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
