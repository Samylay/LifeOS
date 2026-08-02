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
- **`contrast-color()` is evaluated and shelved** (2026-07-31, prototype in
  `~/scratch/lifeos-light-fix/contrast-color-prototype.html`). The status
  `--*-foreground` trio looks like the textbook use case, but Level 5 returns
  only black/white via WCAG-2 luminance math: on `--destructive` #ef4444 it
  picks *black* (6.7:1 beats white's 3.2:1), flipping every status badge from
  the white text the design intends. Revisit when Level 6 candidate lists
  (`contrast-color(var(--x) vs white, ...)`) ship; until then keep hand-paired
  foregrounds.
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
  Outside-the-stack proof this discipline works: the Celtic Sea Salt study in
  the vault's "Design reference shelf — galleries and type" (big display over
  tiny body, almost nothing between; hierarchy from one hue at 3 intensities).
- **Typeface pairing (token decision, 2026-07-31)**: `--font-sans` = Plus
  Jakarta Sans (display AND body — one family, weight does the hierarchy),
  `--font-mono` = JetBrains Mono (code, IDs, tabular data). Deliberately no
  separate display face: LifeOS is a density-first tool, not a landing page.
  Re-litigating fonts per surface is the anti-pattern; change the pairing only
  by changing these two tokens in `globals.css`. (Checked against Typewolf's
  checklist logic 2026-07-31: two families max ✓, distinct roles ✓,
  tabular-nums for numbers ✓.)

## Decision cost (Hick's Law)

Time-to-act grows with the number and complexity of competing choices. LifeOS
is a cockpit scanned dozens of times a day — familiarity and low decision cost
beat aesthetic ambition, every time.

- **One primary CTA per surface view.** Everything else is `secondary`/`ghost`
  or lives behind a menu. If two buttons compete for the same glance, demote one.
- **Learnable-by-familiarity over novel.** Reuse the established layout grammar
  (card grid, list rows, header action slot) rather than inventing a new
  arrangement per page. A new pattern must earn its orientation cost.
- **Speed is part of the aesthetic.** Time-to-interactive is a design property:
  no heavy hero media, no decorative JS, no layout shift. Dense text beats
  ornament on data surfaces.

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

## Decisions (read this before generating any UI)

Design decisions are infrastructure: an agent generating UI picks from the
closed sets below, it does not invent. When unsure, the answer is the more
boring, already-used option. (Non-software proof of tokens-vs-composition:
Girlguiding's 2026 uniform — "in uniform" = one top from a closed range +
the group's color scheme, everything else free; see "Design Reference Shelf"
in the vault.)

**Component choice, in priority order:**
1. An existing feature component already doing this job (grep first).
2. A shadcn primitive from `src/components/ui/`.
3. The chart kit (`src/components/charts/`) — only for charts/metrics.
4. An Origin UI pattern copied in and adapted to tokens.
Never: `npm install` a component lib, raw recharts imports, bespoke one-off
widgets duplicating a primitive.

**Defaults that are not optional:** semantic tokens over hexes; `tabular-nums`
on numbers; every data surface renders empty/loading/error; actionable elements
get `active:scale-[0.97]`; interactive elements are real `<button>`/`<a>` with
focus-visible rings (a11y is a default, not a pass).

**Forbidden patterns:** `transition-all`; animating layout properties;
hardcoded `#22c55e`/`#f59e0b`-style status hexes; legacy `--bg-*`/`--text-*`
vars in new code; `text-lg`+ outside page/section titles; more than one
primary CTA per view (see Decision cost above).

**Worked examples:**

```tsx
// Status color — WRONG: hex hardcodes a semantic meaning
<span className="text-[#22c55e]">on track</span>
// RIGHT: semantic token survives theme + palette changes
<span className="text-success">on track</span>
```

```tsx
// Chart in feature code — WRONG: raw recharts import
import { AreaChart } from "recharts";
// RIGHT: the chart kit wraps recharts with tokens + shared tooltip
import { AreaChart } from "@/components/charts";
```

```tsx
// New dropdown need — WRONG: bespoke div-with-onClick popover
<div onClick={...} className="absolute z-50 ...">…</div>
// RIGHT: the copied-in shadcn primitive (keyboard + focus handled)
<DropdownMenu>…</DropdownMenu>  // from ui/dropdown-menu
```

## Charts (`src/components/charts/`)

Tremor-style API on Recharts v3: `AreaChart`, `LineChart`, `BarChart`,
`DonutChart`, `SparkChart`, `KpiCard`, `ProgressBar`, `CategoryBar`,
`Tracker`. Colors come only from `--chart-1..5` + semantic tokens; tooltips
use the shared `ChartTooltip`. Never import recharts directly in feature code.
