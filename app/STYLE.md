# LifeOS UI style guide

## Principles

1. Dark-only. Use the shared dark tokens throughout the app.
2. Destinations are directly visible. Group links by purpose; never hide desktop destinations under More. On phones, one Menu opens the full navigation, with no nested disclosure.
3. Capture routes to the destination that owns it. Voice and the Assistant may capture thoughts; neither creates a separate inbox.
4. Modern, familiar controls with low decision cost. Use the homelab component library before inventing a control.
5. Built to be left quickly. No engagement mechanics or artificial urgency.

## Foundation: homelab Mira library

Owner-requested migration, 2026-09-08. This replaces the previous Aurora / mission-desk visual system and its five-destination navigation limit.

Source: `~/apps/component-library`, shadcn `base-mira` preset `bdvw9YIa`.
The source package uses Base UI, Hugeicons, and DM Sans. LifeOS copies the
components it consumes into `src/components/ui/mira/`, so Docker builds do not
need a sibling checkout or a local file dependency. See
`docs/mira-library.md` for provenance and adaptations.

- Mira primitives: buttons, cards, inputs, textareas, badges, skeletons,
  navigation sidebar, tooltips, sheets, and separators.
- Shared `ui/button`, `ui/card`, `ui/input`, `ui/textarea`, `ui/badge`, and
  `ui/skeleton` imports consume these components across existing features.
- The Button adapter preserves existing `asChild` links. New Base UI
  compositions use `render`.
- Existing Radix feature overlays remain complete Radix compositions, styled
  by the same tokens. Never combine a Base trigger with a Radix popup.
- Charts continue to use `src/components/charts/`, with Recharts underneath.
- Sonner owns notifications; Vaul remains available for gesture drawers.

## Visual language

- DM Sans for display and body; JetBrains Mono for code and tabular telemetry.
- Zinc canvas `#141416`, cards `#1c1c1f`, raised surfaces `#27272a`.
- Neutral primary controls. Semantic success, warning, and destructive colors
  carry meaning, paired with text. Data series may retain their own palette.
- Compact borders and a 10px base radius. Elevation is restrained and static.
- Opaque cards. Translucency belongs to headers and overlays.
- Consume semantic tokens from `src/app/globals.css`; no new palette literals
  in feature components.
- Body copy is 14px, mobile input text is 16px. The source library's tiny
  catalog controls are enlarged for everyday use and phone touch targets.

## Navigation

`src/lib/navigation.ts` is the route inventory used by the sidebar, mobile
navigation, and top-bar title. The most specific matching path owns the active
state, so Approvals does not also mark Decide active.

`NAV_GROUPS` and `NAV_UTILITIES` contain the current destinations. Use those
arrays as the inventory rather than copying a second list into feature code.
Keep every functioning destination accessible in the full navigation.

Mobile quick links are Today, Decide, Chat, and Fluency, plus a consistently
named Menu. The full navigation has page search on phone and desktop. Desktop
supports an icon rail with tooltips and the persisted collapse preference.
Navigation switches to a focus-managed sheet below 1024px.

Downward content scrolling dismisses the top bar and mobile navigation.
Reverse scrolling and keyboard focus restore them. Only user scroll gestures
trigger this behavior; restoring a conversation or streaming text must not
hide navigation. Menus and sheets scroll independently of the page chrome.

## Page grammar

`Page` sets readable width and spacing. `PageHeader` owns the title and useful
actions. No eyebrow, slogan, or explanatory tagline. Put instructions next to
the control they explain. Related destinations live in the header navigation
sheet. `FilterBar` groups local view choices in a horizontally scrollable row.
`SectionHeader` introduces sections. `.work-canvas` marks a working region.

One primary action per view; supporting actions use outline or ghost. On
Decide, the action row stays reachable while the card grows with its content.
Do not absolutely position the active card or impose a fixed content height.

## Decision text and shared patterns

- Decide uses `DecisionText` to show complete text immediately. No "Read
  more" step. Other surfaces may use `CompactText` for optional previews.
- `ActionEffect`: state the outcome before approval. Do not repeat a long
  title inside the effect sentence. Approval consequences and qualifiers stay
  complete and visible.
- `ContextDetails`: secondary explanation and raw instructions, open by
  default. Critical decision consequences remain above it.
- `Provenance`: compact source label with a real external link when available.
- `Authorship`: distinguish "Your words" from "AI structure".
- `EmptyState`: explain why there is nothing to act on. `success` is available
  for completed queues; failed requests must show an error and retry instead.
- Assistant replies default to 60 words. Decisions lead with recommendation
  and consequence, retaining material risks. More detail remains available
  when requested.

Decide copy follows the `i-have-adhd` skill: action first, one concrete next
step, short sentences, no duplicated benefit, and explicit risks. Existing
text stays complete. New assessments and approval briefs use the shared
`~/services/triage/decision-writing.md` rules in their generation prompts.

Homelab choices are explicit: "Queue skill install" and "Save UI reference".
The effect explains whether the next step queues an installation or saves a
reference. Queuing does not claim the skill is installed. Saved UI references
resurface for matching Assistant requests and queued UI work.

## Dialogs and accessibility

Use a separate page for a long task. Use a nonmodal desktop side panel when
the underlying page is relevant. Mobile navigation and Assistant overlays
trap focus, close with Escape, and return focus after closing.

Real links and buttons, visible focus indicators, labeled icon controls,
`aria-current` navigation, and `aria-pressed` view selectors are defaults.
Inactive decision cards are inert and excluded from assistive technology.
Keyboard shortcuts must not intercept typing, focused controls, or dialogs.

## Motion

Only transform, opacity, clip-path, and filter animate. Use the custom easing
and duration tokens, at most 300ms for daily interactions. No transition-all,
no layout-property transitions, and no animated shadows or colors. Keyboard
and constant actions stay instant. Pointer actions use 0.97 press feedback.
Honor reduced motion, reduced transparency, and increased contrast.

## Checks

Run TypeScript, the Vitest suite, lint, and the Docker build. Review desktop,
390px and 320px layouts, mobile navigation focus, long decision text,
selection and approval, undo, and error recovery with synthetic data. Never
use live user data for mutation tests.

## Content space and progressive disclosure

Appllama reference study, 2026-09-26: conversational canvases from Sworkit,
Minutes, Anotar and ChatBox; grouped navigation from Superlist; settings rows
from OmniFocus and Cardhop. Apply their hierarchy within LifeOS's existing
Mira tokens and dark palette. Private reference IDs and screenshots are under
`.scratch/ux-overhaul/research/` at the repository root.

- Chat owns one viewport, one header and one content scroll region. Keep the
  composer visible above the visual viewport edge. Session history belongs in
  Activity; only the running count belongs on its trigger. Notification links
  open their selected session. Meal totals and cards scroll with messages.
- Camera capture to inbox and food-photo logging are separate destinations.
  State the destination in the preview before saving. Photo cards use the
  conversation width instead of nesting inside another message bubble.
- Keep primary content above navigation maps and configuration. Today places
  workspace exploration after the daily content. Settings groups expand in
  place and honor direct hash links. News reading options and bank connection
  details are available on demand.
- Histories support filtering and bounded batches with explicit Show more.
  Preserve complete decision consequences and all records.
- Touch controls are at least 44px. A checkbox's label supplies its hit area;
  do not stretch the checkbox glyph to the size of a button. Mobile form text
  stays 16px to avoid browser focus zoom.
- Verify actual screenshots and scrolling, not HTTP success alone. Include
  360px, 390px, tablet and desktop widths, reduced motion, focus restoration,
  long content and a reduced visual viewport for the composer.
