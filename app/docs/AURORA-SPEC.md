# LifeOS — New Visual Identity: "AURORA" Design System
**Researched 2026-08-22 from:** 2026 SaaS design trend analyses (Linear/Vercel/Raycast/Mercury patterns), dark-glassmorphism guides, mesh/aurora gradient recipes (coloracci, nineproo, superdesign.dev), typography pairings (Inter+Space Grotesk / Geist), Muz.li dark-mode gallery.

**Owner mandate:** complete visual break from the past. Not a tweak — new identity.

## The direction: "Aurora on charcoal"
The 2026 winning formula (3 of 4 sources converge): **dark-first + ONE electric accent + aurora mesh atmosphere + bento surfaces + Geist-class type.**

| Layer | Old (sage glass) | NEW (Aurora) |
|---|---|---|
| Ground | #0a0d0b green-black | **Deep space navy-violet `#08090f`** with animated aurora mesh glows (violet→cyan→emerald) |
| Panels | green-tinted translucent | **Charcoal-violet glass `rgba(18,20,32,0.6)`**, blur-xl, 1px white/[0.08] edge |
| Accent | sage #8fd4a8 | **Electric cyan `#22d3ee`** (Raycast-red/Cursor-cyan school) used ONLY for interactive/focus/live data |
| Type | Plus Jakarta Sans everywhere | **Space Grotesk display (headings ≥18px) + Inter body/UI + JetBrains Mono numerals** |
| Radius | 14px cards | **16px cards, full-round pills** for chips/badges/tabs |
| Charts | sage mono | cyan→violet duotone gradients |

### Binding requirements
- A1 tokens: `.dark` block rewritten to Aurora palette (--background #08090f, --card rgba(18,20,32,.6), --primary #22d3ee, --ring #22d3ee, chart duotone). All existing semantic vars keep their NAMES (zero component churn) but change VALUES.
- A2 aurora mesh: `body::before` gets the layered radial-gradient recipe (violet #7c3aed33 at 30% 20%, cyan #06b6d42e at 80% 60%, emerald #10b98126 at 55% 85%) + slow drift animation (60s, transform-only, reduced-motion static).
- A3 fonts: install @fontsource-variable/space-grotesk + @fontsource-variable/inter; --font-sans = Inter var; new --font-display = Space Grotesk var applied to h1/h2/.section-label via globals rules (not per-component edits).
- A4 glass: .glass-panel updated to white-tint base rgba(255,255,255,0.04)+border-white/[0.1] (the dark-glassmorphism canonical recipe); card.tsx ring-white/[0.08].
- A5 glow discipline: accent glow only on primary buttons, active nav pill, focus rings, live status dots. Nothing else.
- A6 charts: GRID_STROKE → violet-tinted alpha; tooltip stays popover-elevated.
- A7 gates: tsc clean, vitest 411+, lint == 12 baseline, docker deploy + routes 200.
- A8 STYLE.md identity section replaced (docs never lie).

## PROCESS
Work directly on master on the homelab clone (~/apps/lifeos) over SSH; push to origin from there. Commit per unit.
