# LifeOS UI style guide

Adopted 2026-07-19 (Samy's spec): unified **shadcn/ui + Tremor** foundation,
copy-in only — every component lives in this repo, no installed component libs.

## Stack & when to use what

| Need | Use | Where |
|---|---|---|
| Buttons, inputs, dialogs, dropdowns, tabs, tables, badges… | **shadcn/ui** primitives | `src/components/ui/` |
| KPI cards, line/area/bar/donut charts, sparklines, trackers, progress/category bars | **Tremor-style chart kit** (our code, Recharts v3 underneath) | `src/components/charts/` |
| Gaps neither covers (timelines, rich inputs, complex list rows) | **Origin UI** patterns, copied in and adapted | `src/components/ui/` or feature dir |

Rules: prefer shadcn primitives first; reach for the chart kit only for
charts/metrics; Origin only when neither covers it. Never `npm install` a
component library (Radix primitives + recharts are the only runtime deps).

## Tokens (`src/app/globals.css`)

- **Semantic layer** — `--background`, `--foreground`, `--card`, `--primary`
  (sage), `--secondary`, `--muted`, `--accent-ui`, `--destructive`, `--success`
  (green), `--warning` (amber), `--border`, `--input`, `--ring`, `--chart-1..5`,
  `--radius`. Consume via Tailwind classes (`bg-card`, `text-muted-foreground`,
  `border-border`, `rounded-lg`).
- **Status colors are tokens, not hexes**: use `text-success`/`bg-success`/
  `border-success` (+`text-success-foreground`), same for `warning` and
  `destructive`, or `var(--success)`/`var(--warning)` in inline styles and JS
  color maps. Never hardcode `#22c55e`/`#f59e0b` for a success/warning meaning.
  Genuine multi-hue *data* palettes (area colors, priority scales, lead
  lifecycle, category chips) stay as their own hex maps — they aren't the
  success/warning semantic pair even when a shade coincides.
- Built on the **sage/warm palette** (`--color-sage-*`, `--color-warm-*`).
  Dark mode first; light fully supported. The `.dark` class on `<html>` is
  authoritative — the layout script and theme store always resolve "system"
  to a concrete class.
- Legacy `--bg-*` / `--text-*` / `--border-*` / `--accent` vars are
  **deprecated aliases**: don't use them in new/migrated code; delete them once
  no component references them.
- Spacing: 4/8px grid (Tailwind default scale — stick to 0.5/1/1.5/2/3/4/6/8).
- Type scale: `text-xs`/`text-sm` for UI chrome and rows, `text-base` body,
  `text-lg`+ only for page/section titles. Numbers get `tabular-nums`.

## Shared patterns

- **Card shell**: `<Card>` from `ui/card.tsx` — compact padding (`p-4`,
  `gap-2`), header = title (`text-sm font-semibold`) + optional action on one
  row. Density-first: built for scanning, not landing pages.
- **Empty / loading / error**: `EmptyState`, `Skeleton` (ui/skeleton), and
  inline error text in `text-destructive text-sm`. Every data surface renders
  all three states.
- **Motion**: interaction-craft doctrine still governs (see repo CLAUDE.md) —
  transform/opacity only, ≤300ms, custom easing vars, `active:scale-[0.97]`
  press feedback, minimal and purposeful.

## Charts (`src/components/charts/`)

Tremor-style API on Recharts v3: `AreaChart`, `LineChart`, `BarChart`,
`DonutChart`, `SparkChart`, `KpiCard`, `ProgressBar`, `CategoryBar`,
`Tracker`. Colors come only from `--chart-1..5` + semantic tokens; tooltips
use the shared `ChartTooltip`. Never import recharts directly in feature code.
