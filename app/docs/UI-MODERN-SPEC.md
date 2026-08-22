# LifeOS UI Modernization — Implementation Spec

**Branch:** `ui-modern` (off master). Owner decision 2026-08-22: Principle 4
("the boring, already-used option wins") is AMENDED — the app should look
modern and feel impeccable. Principles 1 (dark-only), 2 (5 destinations),
3 (Assistant = only capture), 5 (no engagement mechanics) still stand.
Interaction-craft doctrine still governs motion.

## Direction: "quiet modern" (Linear/Vercel/Raycast school)
Not flashy — *precise*. The modern look comes from these levers, in order of impact:

### M1. Depth & surface system (biggest lever)
- Cards lose hard borders as the primary separator; gain **layered elevation**:
  subtle 1px inner top highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`),
  soft ambient shadow (`0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)`),
  on a slightly darker page ground than cards (increase bg/card contrast step).
- New tokens: `--surface-1` (page), `--surface-2` (card), `--surface-3`
  (popover/drawer/hover-raised) with matching shadow scales (`--shadow-card`,
  `--shadow-pop`). Wire into shadcn card/popover/dialog/dropdown/sheet.
- Hover state on interactive cards: translateY(-1px) + shadow deepen,
  transition-transform/opacity/box-shadow ≤200ms custom easing.

### M2. Radii + spacing rhythm
- `--radius`: 0.625rem → 0.875rem for cards/popovers; inputs/buttons stay 10px.
- Consistent 8px grid; card padding 20px→24px desktop, 16px mobile.

### M3. Color refinement
- Sage stays the brand hue but desaturate the ground: warm-950 → a slightly
  blue-shifted near-black (`--background: #101210` family) so sage pops less
  muddily; borders from warm-800 → alpha-based (`color-mix(in srgb, var(--foreground) 8%, transparent)`).
- Accent usage discipline: sage only for interactive/focus/primary states,
  never decoration. Status colors keep AA contrast (verify each pairing).

### M4. Typography hierarchy
- Page titles: text-xl→text-2xl, tracking-tight; body unchanged; tabular-nums
  everywhere numbers render. Section labels get `text-[11px] font-semibold
  uppercase tracking-[0.08em] text-muted-foreground` consistently (one utility
  class `.section-label` in globals.css).

### M5. Micro-interactions (interaction-craft compliant)
- All buttons: press scale 0.97 exists — add focus-visible ring polish +
  loading-state morphs (icon swap, no layout shift).
- Nav items (sidebar/bottom): animated active indicator that slides between
  items (transform only, 200ms spring-ish ease var) instead of per-item highlight.
- Skeletons shimmer instead of pulse (translateX sweep, opacity gradient).
- Toast entry: slide+spring from bottom-right; drawer curves already good.
- Page transitions already use .enter — extend stagger to 2nd-level sections.

### M6. Component polish pass
- Buttons: subtle top-edge highlight via inset shadow; primary button gets a
  faint sage glow on hover (`box-shadow: 0 0 0 1px color-mix(...), 0 4px 12px color-mix(in srgb, var(--primary) 25%, transparent)`).
- Inputs: darker field than card (`bg-input/40`), border only on hover/focus.
- Charts: thinner bars/lines (bar radius 4→6, grid lines alpha 6%), tooltip
  styled to match popover elevation.
- Empty states: icon in a soft tinted circle + one-line hint (consistent
  component).

## BINDING REQUIREMENTS (reviewer checks)
- U1: Token layer adds --surface-1/2/3 + --shadow-* scales; both themes coherent; dark-only preserved.
- U2: Card/Popover/Dialog/DropdownMenu/Sheet consume new elevation (no hard border-only look); grep ui/*.tsx shows shadow classes/tokens in use.
- U3: Background/card contrast increased vs today (page darker than cards); borders alpha-based where touched.
- U4: `.section-label` utility exists and is applied to section headers on / /status /workouts /finance /settings (spot-check 5 pages).
- U5: Sidebar AND bottom-nav active indicator animates position (shared component or shared CSS), transform-only.
- U6: Skeletons shimmer (new keyframes, reduced-motion collapses).
- U7: Buttons/inputs restyled per M6; no layout shift on loading states.
- U8: Charts restyled per M6 without changing data logic.
- U9: Motion budget respected: transform/opacity/filter/box-shadow ONLY (box-shadow allowed now for elevation, still ≤300ms, no transition-all), reduced-motion block covers new animations.
- U10: Gates: tsc clean, vitest 411+ green, lint errors == 12 baseline, docker build passes ON THE HOMELAB (orchestrator runs), all routes 200 after deploy.
- U11: STYLE.md updated FIRST (amendment note under Principle 4 + new "Modern surface system" section) so docs never lie.

## PROCESS
- Same repo conventions (conventional commits, no co-author, never vault/.env/db).
- File ownership split by orchestrator at dispatch time.
