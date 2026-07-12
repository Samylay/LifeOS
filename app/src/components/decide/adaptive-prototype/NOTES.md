# Adaptive UI prototype — notes

**Question:** when a card approved in /decide opens into a UI *generated from
its own suggestion/assessment* (instead of Samy opening the link and doing the
legwork), what does that look like — and where do recurring UI shapes live?

**Shape of the answer being tested:**
- Generation happens at enrichment time, not render time: a host script
  (`services/triage/adaptive-spec-prototype.py`) has `claude -p` read each
  approved item's assessment and emit a small **view spec** (which template +
  filled slots), stored in `users/local/adaptivePrototype`.
- The UI is a **template registry** (`src/lib/adaptive-prototype.ts`) of four
  structurally different workspaces — reading room / study card / validation
  bench / filing slip — plus one interpreter component. The generator only
  chooses and fills; it cannot mint new shapes yet. That registry is the
  "recurring UIs are saved somewhere" hint.
- Interaction: approved list → tap → FLIP morph, card expands into its
  workspace (drawer-curve, transform/opacity only).

**Samy's rulings (2026-07-12)** — all three questions answered and implemented:

1. **Generation timing: nightly, as an EXPERIMENT.** The generator runs in the
   nightly grabbers pass (`services/triage/run-grabbers.sh`, adaptive step) so
   every approved item has a spec by morning. Revert to lazy = set
   `ADAPTIVE_NIGHTLY=0` at the top of that script (one line). Decision card:
   ROADMAP T43, due 2026-07-14 — keep nightly or revert.
2. **Workspace state persists.** Checklist ticks + self-test reveals live in
   `users/local/adaptiveWorkspaceState` (doc id = item id), optimistic PUT via
   the generic data API, reverts visibly on a failed save. Separate collection
   on purpose — delete it and the prototype forgets, the triage items are
   untouched.
3. **Template minting is ON, bias toward more views.** The registry became a
   **bank**: the four seeds are data (`SEED_TEMPLATES` in
   `lib/adaptive-prototype.ts`), minted templates land in
   `users/local/adaptiveTemplateBank`. A template = a named composition of
   whitelisted block primitives (header/reading/facts/verdict/risk/stack/
   selftest/steps/cta/link) rendered by the interpreter in `templates.tsx` —
   never code/HTML, unknown blocks are skipped. The generator decides
   bank-vs-mint per item; every mint is logged (`services/triage/mint.log` +
   `mintReason` on the doc) so pruning later is informed. The mint bias lives
   in `MINT_BIAS` in `adaptive-spec-prototype.py` — flip it there when the
   "more views" phase ends.

Delete this folder + `/decide/adaptive` + `/api/triage/adaptive` +
`lib/adaptive-prototype.ts` + the Sparkles link on /decide once answered.
