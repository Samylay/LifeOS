# Roadmap — LifeOS

> Executor contract: each night an unattended Sonnet agent (`claude -p`, cwd = this repo) picks the FIRST unchecked task, does ONLY that task, verifies it per the task's Verify note, commits with an `autoloop:` prefix (one logical change per commit, never leave the tree dirty), then ticks the checkbox adding the date and a one-line result, and appends details to ## Log (include the pitch + quiz lines per the autoloop convention). If verification fails: revert, leave unchecked, add a `BLOCKED:` note.

## Context for the executor

- App lives in `app/` (Next.js 16 + better-sqlite3); the repo root is also an Obsidian-style vault (`01-Inbox.md`, `02-Knowledge/`, …) — NEVER touch vault content.
- Verify baseline for any code change: `cd app && npx tsc --noEmit && docker compose build && docker compose up -d`, then smoke `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/` (expect 200) plus every route the change touched.
- Serving topology: container binds `127.0.0.1:3000`, exposed to the tailnet via `tailscale serve`. Do not change ports, networks, or mounts except where a task explicitly says so; any `docker-compose.yml`/infra change must be its own commit whose message states the operational effect.
- NEVER touch: user data (`lifeos-data` volume / `data/lifeos.db`), `.env` files, the mounted vault, `~/.hermes`, `~/services/objectives` contents.
- LLM backend is `claude -p` via `src/lib/claude-cli.ts` with Ollama kept as an intentional env-toggle fallback (`GEN_PROVIDER=ollama`) — do not remove Ollama paths.
- Follow the standing autoloop conventions: blindspot pass before building, `autoloop:` commit prefix, pitch + quiz in the log entry.

## Tasks

- [ ] **T01 — Add a test harness (vitest) with first real tests** (M) — the app has zero tests and no `test` script. Add vitest as a devDependency + `"test": "vitest run"` script, then write tests for the two most break-prone pure modules: `src/lib/brief/tz.ts` (`msUntilNextRun`, `isPastHourInTz` across TZ/date boundaries, using fixed `Date` inputs) and `src/lib/server-db.ts` query semantics (`where` ops incl. date-marker comparison, `orderBy`, `limit`) against a temp-file DB via `LIFEOS_DB_PATH`. Do not restructure the modules to make them testable beyond exporting what's needed. Verify: `npx vitest run` all green, `npx tsc --noEmit` clean, docker build still succeeds.
- [x] **T02 — Remove @vercel/analytics** (S) — `src/app/layout.tsx` renders `<Analytics />` from `@vercel/analytics/next` in a self-hosted, tailnet-only app: it phones home to a third party and can never report anything useful here. Remove the import + JSX + dependency. Verify: `grep -r "@vercel/analytics" src package.json` empty, typecheck, rebuild, redeploy, `/` returns 200. *(2026-07-07, session: done in fluff-audit session — Analytics import+JSX+dep removed)*
- [x] **T03 — Drop unused @anthropic-ai/sdk dependency** (S) — it appears in `package.json` but nothing in `src/` imports it (LLM calls go through `claude-cli.ts` / the OpenAI-compat Ollama client). Remove from package.json + lockfile. Verify: `grep -r "@anthropic-ai" src` empty, typecheck, docker build succeeds. *(2026-07-07, session: done in fluff-audit session — dep removed from package.json+lockfile)*
- [x] **T04 — Collapse the firebase.ts compatibility shim** (S) — `src/lib/firebase.ts` is now an 8-line re-export of `local-db` kept only for old import paths (4 hooks + firestore.ts still import it, plus dead `auth`/`googleProvider` nulls). Point those imports at `./local-db` directly, delete `firebase.ts`, and remove any now-unused `auth`/`googleProvider` references. Verify: `grep -rn "firebase" src/` only matches comments/`firestore.ts` filename, typecheck, rebuild, redeploy, smoke the dashboard + one hook-backed route (e.g. `/prime`). *(2026-07-07, session: done in fluff-audit session — 4 hooks repointed to local-db, shim deleted)*
- [ ] **T05 — Retire the legacy morning-brief fallback (GATED)** (M) — only proceed if the in-app brief has run ≥3 consecutive days (check dated entries/log at `BRIEF_OUT` `/data/brief.json` inside the container or scheduler logs via `docker logs lifeos | grep brief-scheduler`); otherwise leave unchecked with a dated note. Remove the `BRIEF_PATH` read-fallback code, the `/home/quorky/services/brief/out:/brief:ro` mount, and the `BRIEF_PATH` env from `docker-compose.yml`. Compose change is its own commit stating the operational effect. Verify: typecheck, rebuild, redeploy, `/brief` route 200 and still shows today's brief.
- [ ] **T06 — Harden server-db writes** (S) — `src/lib/server-db.ts` opens SQLite with WAL but no `busy_timeout`, and any multi-doc write paths run as separate implicit transactions. Add `pragma busy_timeout = 5000`, and wrap any loop-of-writes in `db.transaction(...)`. Behavior must be identical; no schema changes, no touching the live DB file. Verify: T01's server-db tests still green, typecheck, rebuild, redeploy, create+edit a task via the UI/API smoke.
- [ ] **T07 — Unused-export sweep** (M) — run `npx knip` (or `ts-prune`) in `app/`, review the report, and delete only exports/files that are provably unreferenced AND not part of an intentional fallback (Ollama paths, `use-collection` factory surface stay). Blindspot pass mandatory: check the autoloop memory log for anything previously flagged as deliberate before cutting. Verify: typecheck, rebuild, redeploy, smoke every route whose files were touched.

- [ ] **T08 — Training: records view** (M) — port the personal-records section from the retired `~/dashboards/strava-dashboard` (`app/records/page.tsx`) into the /workouts analytics area, computing bests from `/api/strava/activities` rows with `src/lib/training/stats.ts` (kpis/streak already ported; distance PRs from summary rows only — streams are NOT synced, skip stream-based efforts). Verify: typecheck, `npm test` green, rebuild, redeploy, /workouts 200 and shows the records block with real data.
- [ ] **T09 — Training: weekly trends + rolling average chart** (M) — port trends (`app/trends/page.tsx`, `weeklyBuckets`/`rollingAverage`) into the /workouts analytics area. Reuse the app's existing chart approach (see components/training-analytics.tsx) — do NOT add a chart library. Verify: typecheck, test, rebuild, redeploy, /workouts 200 with the trends chart rendering non-empty buckets.
- [ ] **T10 — Training: pace/HR distributions** (S) — port `paceHistogram`/`hrHistogram` rendering from `app/distributions/page.tsx`. Same chart-approach constraint as T09. Verify: typecheck, test, rebuild, redeploy, /workouts 200.
- [ ] **T11 — Training: period comparison** (S) — port `comparePeriods` UI (`app/compare/page.tsx`): this period vs previous, per sport. Verify: typecheck, test, rebuild, redeploy, /workouts 200.
- [ ] **T12 — Training: sport breakdown + calendar heatmap** (M) — port `sportBreakdown` and the activity-days heatmap (`components/heatmap.tsx` — reimplement with CSS grid, do NOT add react-calendar-heatmap). Verify: typecheck, test, rebuild, redeploy, /workouts 200.
- [ ] **T13 — NEEDS-SAMY: per-activity detail (map + streams)** (L) — the dashboard's activity/[id] view needs polyline maps (leaflet) and activity streams, which LifeOS does not sync; decide whether to extend strava-sync to fetch streams + add leaflet, or drop the feature. Samy decides scope before any executor touches it.

## Log

- **2026-07-07 (fluff-audit session, not autoloop):** Samy asked to "remove the fluff".
  Cut: /privacy page (Stride/Firebase-era policy), login-screen.tsx + all dead
  auth branches in app-shell (auth stub always supplies LOCAL_USER), the fake
  top-bar profile dropdown (no-op Sign out) and the placeholder notifications
  bell (nothing ever populates it), and the entire browser-SpeechRecognition
  voice-command stack (voice-command-button, change-preview, voice-mic-button,
  use-voice-input, command-parser — ~1,240 lines; it shipped audio to Google in
  Chrome and duplicated both the chat panel and the one-voice-funnel decision).
  Also executed T02/T03/T04 above. auth-context slimmed to user/loading/
  isFirebaseConfigured (hooks still branch on it). Verified: tsc clean, rebuilt,
  redeployed; /, /brief, /tasks, /prime, /settings 200; /privacy 404. Stale
  host-side .next removed (was breaking host tsc).
  **Pitch:** the app now contains only surfaces that do something real for a
  single user on a tailnet — no ceremony from its public-app past, and no
  second voice pathway that leaked audio to Google.
  **Quiz:** (1) How do you input to the assistant panel now? (2) What happens
  at /privacy? (3) Which import path do use-prime/use-mealplan use for db?
