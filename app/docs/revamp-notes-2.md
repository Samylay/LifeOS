# Revamp 2 — implementation notes (R-E/R-F)

## R-F status-hex audit (2026-08-22)

No component uses a *status-meaning* success/warning/danger hex that needed
migrating: `var(--success)`/`var(--warning)`/`var(--destructive)` were already
in place everywhere they apply (e.g. status-page container dots,
`barColor()` thresholds). The legacy `--bg-*`/`--text-*`/`--border-*`/
`--accent*`/`--focus-ring` aliases had zero references left in src and their
definitions were deleted from `globals.css` (focus ring now uses `--ring`).
`--accent-ui` remains as the real token.

Legit multi-hue DATA palettes that intentionally stay hex:

- `src/components/task-list.tsx` — priority color map (`urgent/high/medium/low`)
  plus `AREA_HEX` fallbacks; a 4-step priority scale, not the semantic pair.
- `src/components/goal-section.tsx` — GOAL_STATES label/color map
  (`unplanned/planned/stale`): a plan-state scale across hues.
- `src/lib/types.ts` — grocery category chip colors; life-area color map.
- `src/lib/content-os.ts` — content-platform category colors.
- `src/components/training-stats.ts` — `SPORT_COLORS` chart series map
  (swim/ride/run/other) consumed by Recharts as literal color strings.
- `src/app/projects/page.tsx` — `AREA_HEX` project-area tints.
- `src/app/settings/page.tsx`, `src/app/layout.tsx` — brand marks
  (Strava orange `#FC5200`, Grafana `#007CC3`) and the PWA `themeColor`.
