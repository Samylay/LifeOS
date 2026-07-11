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

**Verdict:** _pending — Samy to flip through on his phone._
- Which template earns its keep, which is noise?
- Is spec-fills-template enough, or does he want generation to produce novel
  layouts (template minting)?

**Architecture questions this surfaced** (for the refinement conversation):
1. Where does spec generation belong — nightly study step (always-on cost per
   item) or lazily on first approve (latency at tap time)?
2. Should checklist/progress state persist, and if so is it part of the item
   doc or a separate "workspace state" collection?
3. Template minting: if `claude -p` can emit new templates, what's the review
   gate before a generated layout joins the registry?

Delete this folder + `/decide/adaptive` + `/api/triage/adaptive` +
`lib/adaptive-prototype.ts` + the Sparkles link on /decide once answered.
