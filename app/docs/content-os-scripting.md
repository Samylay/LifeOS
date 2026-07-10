# Content OS — AI script drafting (Monday block automation)

Automates the first-draft half of the Monday scripting block from the vault SOP
(`~/vault/obsidian/01-Inbox/content-os/04-production-sop.md`): pull ideas from the
bank, ground each in its assigned hook formula, write the script to the pillar's
exact skeleton, and write the caption + hashtags — via `claude -p`, the same
backend the brief and goals features use. Samy still reviews, reads aloud, cuts
15%, and records everything himself; this only removes the blank-page cost.

The vault docs stay the source of truth. This feature mirrors them; it never
writes to them.

## What was added

| Piece | Where |
|---|---|
| `script` + `caption` fields on `ContentIdea` | `src/lib/types.ts` |
| Pure scripting logic: skeletons, prompt builder, hashtag/caption formatting, weekly batch plan | `src/lib/content-scripting.ts` |
| API route (server-side `claude -p` call) | `src/app/api/content/script/route.ts` |
| `scriptIdea` / `scriptWeeklyBatch` on `useContentIdeas()` | `src/lib/use-content.ts` |
| UI: per-idea wand button + "Draft week's batch" + script/caption viewer | `src/app/content/page.tsx` (Idea Bank tab) |
| Tests (19; model call mocked) | `src/lib/content-scripting.test.ts` |

## How to use it

In **/content → Idea Bank**:

- **Per idea** (status `idea`): the wand button drafts script + caption and flips
  the idea to `scripted`. Disabled until the idea has a hook formula — per the
  playbook, an idea without one is a topic, not a post.
- **Draft week's batch**: picks the next unscripted ideas in bank order per the
  weekly cadence — 2 Build Log + 1 Workflow Win + 1 Under the Hood — and drafts
  them sequentially with progress shown on the button.
- The file icon toggles the drafted script + caption inline on the idea card.
  Edit via the normal idea editor or regenerate after tweaking title/notes
  (set status back to `idea` to re-enable the wand).

Requires `GEN_PROVIDER=claude-cli` (the default deployment config); the route
returns 503 otherwise.

## What the generator enforces (from the vault docs)

- **Skeletons** (`03-hook-script-library.md`, verbatim beats in the prompt):
  Workflow Win 15–30s/~65–80 words; Build Log 30–60s/~110–150 words with the
  serial CTA teasing episode n+1; Under the Hood 5–10 slides, ≤30 words/slide,
  returned one slide per line.
- **Hooks**: the script's first line is a concrete instantiation of the idea's
  assigned `HOOK_FORMULAS` template — and never contains tool/product/model
  names (those go in the caption, per the non-negotiables).
- **Captions** (`05-publishing-engagement.md`): keyword in the first 50 chars,
  2–3 sentences of context (tool names welcome here — SEO), pillar-matched CTA
  (follow-for-next-episode on Build Log, save/send otherwise), then a hashtag
  row normalized in code: 3–5 tags, keyword-verbatim tag first, always
  `#buildinpublic`, `#fyp`-style bait stripped.
- **Voice** (`01-brand-foundation.md`): the do/don't table is embedded in the
  prompt (numbers over adjectives, admit failure, no hype words, no intros).

## The 12-idea floor

`KILL_SCALE_RULES`: "never let unscripted ideas drop below 12." The batch
planner counts ideas with status `idea` and only drafts as many as keeps the
bank at ≥12. When it can't draft the full 4, it keeps them in the strategy's
cut-priority order (`02-content-strategy.md`: cut the carousel first, then one
Build Log, never the Workflow Win) and reports the rest as blocked with the
reason. At or below 12 unscripted ideas it drafts nothing and tells you to
brainstorm first.

## Why a manual button, not a Monday cron (v1 decision)

The brief scheduler pattern (`src/lib/brief/scheduler.ts`) would make a Monday
06:30 auto-run trivial, but this output is words Samy publishes under his own
recorded voice — a human trigger keeps his judgment at the start of the
pipeline while the prompt earns trust. Flagged as ROADMAP T25c: schedule it
once a few weeks of manual batches look consistently right.

## Explicitly out of scope (and why) — see ROADMAP T25/T25b/T25c

- **Voice cloning / TTS** — Samy records his own voice; the voice IS the brand.
  Not flagged for later; permanently out.
- **Auto-publishing** (TikTok/IG/YT) — needs platform API credentials and app
  registrations that don't exist; not something to stub. ROADMAP T25.
- **Analytics auto-pull** — same credential blocker; the Friday manual review
  stands. ROADMAP T25b.
- **Editing automation** (whisper auto-captions, silence cutting) — feasible on
  the homelab later, but the SOP's own kill-rule ("ship rough or drop") keeps a
  human in the edit loop for now. One-line flag in the ROADMAP section.
