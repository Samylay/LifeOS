# LifeOS — Features

Personal life-ops app. Next.js 16 (App Router) + better-sqlite3 local DB (`data/lifeos.db`) — no Firebase/Firestore, everything runs locally.

## Stack

- **Framework**: Next.js 16, App Router, TypeScript.
- **Data**: better-sqlite3 local database; typed stores per collection (local-db pattern). No cloud backend.
- **LLM**: `claude -p` via `src/lib/claude-cli.ts`; Ollama fallback behind an env toggle (Settings).
- **UI**: dark-only sage/warm theme (see `STYLE.md`); shadcn/ui primitives (`src/components/ui/`), Tremor-style chart kit on Recharts v3 (`src/components/charts/`), Origin UI patterns copied in when neither covers a need. Copy-in only — no component-lib installs.
- **Motion**: house doctrine — transform/opacity/clip-path/filter only, ≤300ms, custom easing, `active:scale-[0.97]`, `prefers-reduced-motion` respected. `sonner` + `vaul` approved.

## Feature surfaces

| Surface | What it does |
|---|---|
| Dashboard (`/`) | Morning/evening brief, attention surface, headline stats |
| Decide (`/decide`) | Saved-item triage: each card names the action approving it commits, and approving performs it |
| Approvals (`/decide/approvals`) | ROADMAP NEEDS-USER asks, on their own surface |
| Send to Claude (`/decide/dispatch`) | Queue instructions for a Claude session, dispatch the merged brief |
| Knowledge (`/knowledge`, `/knowledge/teach/[id]`) | Knowledge base, capture, teach-back sessions per topic |
| Feed (`/feed`) | IG replacement; cards unlock via recall quizzes (no engagement mechanics) |
| Finance (`/finance`) | Bank sync, budgets, transactions, monthly view |
| News (`/news`, `/news/feeds`) | Aggregated news digest; per-source feed manager |
| Voice (`/voice`, `/voice/[id]`) | VoicePal: voice notes with transcripts |
| Leads (`/leads`) | Lead lifecycle tracking |
| Workouts (`/workouts`) | Training log synced from Strava |
| Recipes (`/recipes`) | Recipe collection and meal planning |
| Pager (`/pager`) | Notify messages and quick actions |
| Prime (`/prime`, `/prime/manage`) | Daily affirmations and their management |
| Projects (`/projects`) | Projects and shipped work |
| Settings (`/settings`) | Integrations, LLM backend toggle, app config |
| Status (`/status`) | Life-status dashboard with stat tiles |
| Content (`/content`) | Content pipeline management |
| Terminal (`/terminal`), Diagrams (`/diagrams`) | Utility surfaces |

## Laws that shape features

- Five nav destinations; everything else lives under More.
- The Assistant is the only capture surface — no second capture UI.
- No engagement mechanics (streaks/XP/infinite feeds).
- Status colors are semantic tokens, never hard-coded hexes.
