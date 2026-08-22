import type { CSSProperties } from "react";

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

/** Grid lines at 6% foreground alpha (UI-MODERN-SPEC M6/U8) — barely-there
 *  rules that structure without drawing. Alpha-based per M3. */
export const GRID_STROKE = "color-mix(in srgb, var(--foreground) 6%, transparent)" as const;

/**
 * Shared popover-elevation style for chart tooltips (UI-MODERN-SPEC M6):
 * --surface-3 background, --shadow-pop shadow (with the spec's layered
 * ambient values as fallback while the token lands), rounded-xl. Spread it
 * onto the tooltip root — every chart in this kit routes through ChartTooltip,
 * which consumes it here.
 */
export const tooltipPopoverStyle = (): CSSProperties => ({
  background: "var(--surface-3, var(--popover))",
  boxShadow: "var(--shadow-pop, 0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2))",
});

export type ChartValueFormatter = (value: number) => string;

export const defaultValueFormatter: ChartValueFormatter = (value) => String(value);
