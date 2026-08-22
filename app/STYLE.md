# LifeOS UI style guide

## Principles (drafted 2026-08-06 from decisions already made)

Short, opinionated, arguable — they pre-settle recurring debates (per Vitaly
Friedman's practical guide to design principles; phrasing corpus:
https://principles.design). Each one is a decision Samy already made, not an
aspiration. When a review or a new feature contradicts one, the principle
wins unless Samy retires it.

1. **Dark-only. We delete themes rather than maintain two.** Every surface is
   designed against the dark tokens; there is no light mode to keep honest
   (removed 2026-08, commit 9a197fa).
2. **Five destinations. A new surface earns a nav slot only by displacing
   one.** Everything else lives under More or a footer link (nav diet,
   2026-07-29). If it can't displace anything, it isn't primary.
3. **The Assistant is the only capture surface.** New input modes (voice,
   share, brain-dump) route into it; we do not build a second capture UI
   (decision 2026-07-16, re-architecting it is the anti-pattern).
4. **The boring, already-used option wins** *(amended 2026-08-22 by Samy)*.
   LifeOS is scanned dozens of times a day: familiarity and low decision cost
   beat aesthetic ambition, and a novel pattern must earn its orientation cost
   (Hick's-law section below is the enforcement arm).
   **Amendment (2026-08-22):** modern and impeccable beats boring-familiar;
   novelty still must not cost orientation.
5. **Built to be left quickly. No engagement mechanics, ever.** No streaks,
   no infinite feeds, no attention-holding tricks; even /feed (the IG
   replacement) gates cards on recall quizzes instead of rewarding time
   spent (2026-07-20 quiz-only interval law).

Adopted 2026-07-19 (Samy's spec): unified **shadcn/ui + Tremor** foundation,
copy-in only — every component lives in this repo, no installed component libs.

## Modern surface system (2026-08-22)

Depth comes from layered elevation on a stepped surface ladder, not hard
borders ("quiet modern" — Linear/Vercel/Raycast school). Tokens live in
`src/app/globals.css`.

- **Surface ladder** — `--surface-1` (page ground, darkest), `--surface-2`
  (cards), `--surface-3` (popovers/dialogs/drawers, the raised tier). In dark,
  the page (`#101210`, slightly blue-shifted near-black) is *darker* than
  cards (warm-900 family) so cards read as raised without a border.
  Consume via Tailwind utilities `bg-surface-2` / `bg-surface-3`.
- **Shadow scales** — `--shadow-card` (1px inner top highlight + soft ambient:
  `inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.3),
  0 4px 16px rgba(0,0,0,0.2)` in dark) and `--shadow-pop` (deeper, for
  popover/dropdown/dialog/sheet tiers). Utilities `shadow-card`/`shadow-pop`.
  Shadows are allowed motion properties for elevation transitions only
  (≤300ms custom easing).
- **Alpha borders** — borders are derived, not painted:
  `color-mix(in srgb, var(--foreground) 8%, transparent)` as `--border` in
  dark. Never reach for warm-800-style opaque borders; a hairline at low alpha
  stays for definition where a shadow alone isn't enough.
- **Radii** — `--radius-card: 0.875rem` for card-tier surfaces (utility
  `rounded-card`); inputs/buttons keep 10px (`rounded-md` off `--radius`).
- **`.section-label`** — one utility class for section headers:
  `text-[11px] font-semibold uppercase tracking-[0.08em]
  text-muted-foreground`. Use it instead of hand-rolling label styles.


## Stack & when to use what

| Need | Use | Where |
|---|---|---|
| Buttons, inputs, dialogs, dropdowns, tabs, tables, badges… | **shadcn/ui** primitives | `src/components/ui/` |
| KPI cards, line/area/bar/donut charts, sparklines, trackers, progress/category bars | **Tremor-style chart kit** (our code, Recharts v3 underneath) | `src/components/charts/` |
| Gaps neither covers (timelines, rich inputs, complex list rows) | **Origin UI** patterns, copied in and adapted | `src/components/ui/` or feature dir |

Rules: prefer shadcn primitives first; reach for the chart kit only for
charts/metrics; Origin only when neither covers it. Never `npm install` a
component library (Radix primitives + recharts are the only runtime deps).

## Identity: dark glass (2026-08-22, owner decision)

The app's visual identity is **dark glass**: frosted translucent panels over a
deep green-tinted ground with sage glow accents. Cards/popovers/sheets use
semi-transparent `--card`/`--popover` + `backdrop-blur`; `body::before` paints
fixed radial sage glows; shadows carry a faint sage under-glow
(`--shadow-card`/`--shadow-pop`). Primary is a brighter mint (`#8fd4a8`).
`.glass-panel` is the utility when building outside the primitives.

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
  Dark-only since 2026-08 (commit 9a197fa removed light mode — see
  Principle 1): `.dark` is server-rendered on `<html>`, a stored
  `lifeos-theme=light` preference is ignored, and the dark values are the
  only values.
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

## Modal vs page vs nonmodal (decision rule, 2026-08-06)

From Vitaly Friedman's decision tree (smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree)
plus NN/g: most overlays fire at the wrong moment and interrupt — an overlay is
interruptive by nature, so it must earn its severity. Vocabulary: *dialog* =
any user-system exchange; *overlay* = panel on top of the page; *modal* =
overlay with the background disabled; *nonmodal* = background stays usable;
*lightbox* = dimmed backdrop for focus.

Ask three questions, in order:

1. **Does the user need the underlying screen's context?** No → it's a page,
   not an overlay.
2. **Is the task short and self-contained (one decision, one small form)?**
   No (multi-step, needs full attention, or worth a shareable/bookmarkable
   URL) → page/route.
3. **Must the background be locked?** Only for destructive/irreversible
   confirmations. Otherwise prefer **nonmodal** (side panel, bottom sheet the
   user can leave) over modal.

Repeated high-frequency tasks get neither: inline edit or an expandable row.
Never open an overlay uninvited (on load, on timer) — overlays are answers to
a user action, not announcements.

Audit against the current inventory (2026-08-06): `ConfirmDialog` call sites
(leads, recipes, content, goals, projects, prime) and the Archive-project
dialog are question-3 cases — correct as modals. The Assistant chat panel is
correctly nonmodal on desktop (side panel, background live); on mobile it
scrims — acceptable while capture stays one-shot, but if a mobile chat grows
multi-step it wants a route. The voice Transform-presets modal is the one
borderline case: it nests a second step (list → edit form) inside a dialog;
if it grows a third state, promote it to a route. Nothing currently modal
should be a page — keep it that way by running new flows through the three
questions above.

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

## Reference layouts (minimalist + typography, bestwebsite.gallery)

Pulled 2026-08-02 from the Minimalist filter
(https://bestwebsite.gallery/sites/style/minimalist — cross-read with
/sites/style/typography; the gallery has no combined-facet URL). What each
one proves for a density-first tool UI:

- **LoveFrom** (lovefrom.com — Center/Typography/Minimalist, GSAP): one serif
  wordmark centered on an off-white field, nothing else above the fold. Proof
  that a single type element can be the entire surface — the ceiling case for
  "weight does the hierarchy, one family" (our Plus Jakarta rule).
- **Fossheim** (fossheim.io — Center/Typography/Minimalist): centered single
  column, headline + dated post list, zero chrome. The shape /brief and
  /knowledge lists should degrade to when a card earns nothing extra.
- **Good Books** (Center/Minimalist/Bright, Webflow): one centered
  recommendation at a time, huge title, tiny meta. Proof for one-subject
  screens (/feed quiz, /decide cards): a single centered object + type scale
  beats any multi-panel layout.
- **Metric Design** (metric.no — Agency/Case-studies/Minimalist, Tailwind +
  Craft): case-study index as plain typographic rows, no thumbnails until
  hover. Reference for list-first index pages (/projects, /content tracker).
- **Typography Nerd** — already studied in depth in the vault: "Design
  reference shelf — galleries and type" (type-as-imagery, one repeated link
  affordance, persistent left rail).

Motif-derived consistency (vault: "Barbican homeware — motif-derived
consistency", 2026-08-21): the Barbican × Made.com homeware line reads as one
system because every piece derives from the same architectural motif, not
because pieces share a palette. Argument for deriving a token *set* from a
shared rule (a proportion, an angle) rather than matching one-off screens by
eye.
- **House of Honey** (houseofhoney.com, studied 2026-08-11 in the vault
  "Design references" note): nameplate masthead (identity spent in one band,
  never repeated as decoration) + a two-register type ladder with no middle
  sizes. Proof that hierarchy can come entirely from the jump between one
  display register and one label register — the discipline to check /brief
  and /knowledge headers against before adding an intermediate size.
- **Iceberg** (icebergdoc.org, studied 2026-08-12 in the vault "Design
  references" note): the dark counterpart to this set. Persistent 1px column
  rules as the only chrome (nav labels sit atop columns, content scrolls
  through the grid), viewport-scale display type over full-bleed photography
  with margin-numbered statements, and a single yellow side rail as the one
  hue on the page. Reference for spending color once as an affordance and for
  wayfinding via a fixed rule structure instead of a header.

## Charts (`src/components/charts/`)

Tremor-style API on Recharts v3: `AreaChart`, `LineChart`, `BarChart`,
`DonutChart`, `SparkChart`, `KpiCard`, `ProgressBar`, `CategoryBar`,
`Tracker`. Colors come only from `--chart-1..5` + semantic tokens; tooltips
use the shared `ChartTooltip`. Never import recharts directly in feature code.
