// Shared constants/helpers for the Tremor-style chart kit. Internal to
// src/components/charts — feature code should import from the barrel
// (@/components/charts), not this file directly.

/** Default categorical palette — semantic chart tokens, cycled if there are
 * more categories than colors. */
export const DEFAULT_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function getColor(colors: readonly string[] | undefined, index: number): string {
  const palette = colors && colors.length > 0 ? colors : DEFAULT_CHART_COLORS;
  return palette[index % palette.length];
}

/** Shared axis tick styling — text-xs, muted-foreground fill, no lines. */
export const AXIS_TICK_STYLE = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export type ChartValueFormatter = (value: number) => string;

export const defaultValueFormatter: ChartValueFormatter = (value) => String(value);
