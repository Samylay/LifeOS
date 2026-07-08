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

- [x] **T01 — Add a test harness (vitest) with first real tests** (M) — the app has zero tests and no `test` script. Add vitest as a devDependency + `"test": "vitest run"` script, then write tests for the two most break-prone pure modules: `src/lib/brief/tz.ts` (`msUntilNextRun`, `isPastHourInTz` across TZ/date boundaries, using fixed `Date` inputs) and `src/lib/server-db.ts` query semantics (`where` ops incl. date-marker comparison, `orderBy`, `limit`) against a temp-file DB via `LIFEOS_DB_PATH`. Do not restructure the modules to make them testable beyond exporting what's needed. Verify: `npx vitest run` all green, `npx tsc --noEmit` clean, docker build still succeeds. *(2026-07-08: done in autoloop — vitest/test script were already present from an earlier session; added tz.test.ts (TZ/date-boundary coverage) and server-db.test.ts (where/orderBy/limit + CRUD against a temp-file DB), 38/38 tests green, tsc clean, docker build succeeds)*
- [x] **T02 — Remove @vercel/analytics** (S) — `src/app/layout.tsx` renders `<Analytics />` from `@vercel/analytics/next` in a self-hosted, tailnet-only app: it phones home to a third party and can never report anything useful here. Remove the import + JSX + dependency. Verify: `grep -r "@vercel/analytics" src package.json` empty, typecheck, rebuild, redeploy, `/` returns 200. *(2026-07-07, session: done in fluff-audit session — Analytics import+JSX+dep removed)*
- [x] **T03 — Drop unused @anthropic-ai/sdk dependency** (S) — it appears in `package.json` but nothing in `src/` imports it (LLM calls go through `claude-cli.ts` / the OpenAI-compat Ollama client). Remove from package.json + lockfile. Verify: `grep -r "@anthropic-ai" src` empty, typecheck, docker build succeeds. *(2026-07-07, session: done in fluff-audit session — dep removed from package.json+lockfile)*
- [x] **T04 — Collapse the firebase.ts compatibility shim** (S) — `src/lib/firebase.ts` is now an 8-line re-export of `local-db` kept only for old import paths (4 hooks + firestore.ts still import it, plus dead `auth`/`googleProvider` nulls). Point those imports at `./local-db` directly, delete `firebase.ts`, and remove any now-unused `auth`/`googleProvider` references. Verify: `grep -rn "firebase" src/` only matches comments/`firestore.ts` filename, typecheck, rebuild, redeploy, smoke the dashboard + one hook-backed route (e.g. `/prime`). *(2026-07-07, session: done in fluff-audit session — 4 hooks repointed to local-db, shim deleted)*
- [ ] **T05 — Retire the legacy morning-brief fallback (GATED)** (M) — only proceed if the in-app brief has run ≥3 consecutive days (check dated entries/log at `BRIEF_OUT` `/data/brief.json` inside the container or scheduler logs via `docker logs lifeos | grep brief-scheduler`); otherwise leave unchecked with a dated note. Remove the `BRIEF_PATH` read-fallback code, the `/home/quorky/services/brief/out:/brief:ro` mount, and the `BRIEF_PATH` env from `docker-compose.yml`. Compose change is its own commit stating the operational effect. Verify: typecheck, rebuild, redeploy, `/brief` route 200 and still shows today's brief.
- [ ] **T06 — Harden server-db writes** (S) — `src/lib/server-db.ts` opens SQLite with WAL but no `busy_timeout`, and any multi-doc write paths run as separate implicit transactions. Add `pragma busy_timeout = 5000`, and wrap any loop-of-writes in `db.transaction(...)`. Behavior must be identical; no schema changes, no touching the live DB file. Verify: T01's server-db tests still green, typecheck, rebuild, redeploy, create+edit a task via the UI/API smoke.
- [ ] **T07 — Unused-export sweep** (M) — run `npx knip` (or `ts-prune`) in `app/`, review the report, and delete only exports/files that are provably unreferenced AND not part of an intentional fallback (Ollama paths, `use-collection` factory surface stay). Blindspot pass mandatory: check the autoloop memory log for anything previously flagged as deliberate before cutting. Verify: typecheck, rebuild, redeploy, smoke every route whose files were touched.

- [x] **T08 — Training: records view** (M) — port the personal-records section from the retired `~/dashboards/strava-dashboard` (`app/records/page.tsx`) into the /workouts analytics area, computing bests from `/api/strava/activities` rows with `src/lib/training/stats.ts` (kpis/streak already ported; distance PRs from summary rows only — streams are NOT synced, skip stream-based efforts). Verify: typecheck, `npm test` green, rebuild, redeploy, /workouts 200 and shows the records block with real data. *(2026-07-07, session: already covered — TrainingAnalytics' Records section predated the merge; streak chip added via ported stats)*
- [x] **T09 — Training: weekly trends + rolling average chart** (M) — port trends (`app/trends/page.tsx`, `weeklyBuckets`/`rollingAverage`) into the /workouts analytics area. Reuse the app's existing chart approach (see components/training-analytics.tsx) — do NOT add a chart library. Verify: typecheck, test, rebuild, redeploy, /workouts 200 with the trends chart rendering non-empty buckets. *(2026-07-07, session: already covered — 12-week stacked trend chart predated the merge)*
- [x] **T10 — Training: pace/HR distributions** (S) — port `paceHistogram`/`hrHistogram` rendering from `app/distributions/page.tsx`. Same chart-approach constraint as T09. Verify: typecheck, test, rebuild, redeploy, /workouts 200. *(2026-07-07, session: done in session — pace/HR histograms shipped in training-insights.tsx)*
- [x] **T11 — Training: period comparison** (S) — port `comparePeriods` UI (`app/compare/page.tsx`): this period vs previous, per sport. Verify: typecheck, test, rebuild, redeploy, /workouts 200. *(2026-07-07, session: done in session — 30d-vs-previous compare tiles shipped in training-insights.tsx)*
- [x] **T12 — Training: sport breakdown + calendar heatmap** (M) — port `sportBreakdown` and the activity-days heatmap (`components/heatmap.tsx` — reimplement with CSS grid, do NOT add react-calendar-heatmap). Verify: typecheck, test, rebuild, redeploy, /workouts 200. *(2026-07-07, session: sport breakdown already covered (This Year table); heatmap DROPPED per Samy)*
- [x] ~~**T13 — per-activity detail (map + streams)**~~ *(2026-07-07: DROPPED per Samy — no leaflet, no stream sync)*

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

- **2026-07-07 (strava merge round 2, session):** Samy dropped the heatmap + leaflet
  scope and asked for the rest now. Audit showed TrainingAnalytics already had
  records/trends/year-breakdown, so the real gaps were ported into a new
  `training-insights.tsx`: 30-days-vs-previous compare tiles (comparePeriods),
  run-pace + avg-HR histograms (paceHistogram/hrHistogram), and a streak chip
  (currentStreak) — all from `src/lib/training/stats.ts`, recharts only, no
  new deps. tsc clean, 17/17 tests, rebuilt, redeployed, /workouts 200 with
  live data. The retired dashboard repo is now fully harvested and can be
  archived whenever.

- **2026-07-08 (autoloop, T01):** vitest + the `test` script turned out to already
  be in place (added in an earlier interactive session for the training-stats
  tests), so the actual gap was the two modules the task named: `tz.ts` and
  `server-db.ts` had zero coverage. Added `tz.test.ts` (msUntilNextRun /
  isPastHourInTz / todayInTz / weekdayLabelInTz, including the UTC/JST
  date-boundary case the old server-local aggregator got wrong) and
  `server-db.test.ts` (all `where` ops incl. date-marker comparison, orderBy
  asc/desc, limit, full CRUD) against a temp-file DB via `LIFEOS_DB_PATH` —
  never touches the real `data/lifeos.db`. 38/38 tests green, tsc clean,
  docker build succeeds.
  **Pitch:** the two modules most likely to silently break on a timezone edge
  case or a query-semantics regression now have fixed-input tests pinning
  their behavior.
  **Quiz:** (1) What UTC/local edge case does the tz test suite specifically
  guard against? (2) Where does server-db.test.ts point its DB file, and why?
  (3) Which two modules had test coverage before this task ran?

## Pager (homelab notification hub — shipped 2026-07-07: /pager + /api/notify + ntfy push)

- [x] **T14 — Pager retention** (S) — prune pager messages: read messages older than 30 days and `system`-stream heartbeats older than 7 days get deleted server-side (add to the `/api/notify` POST handler as an opportunistic sweep, or a tiny GET /api/notify?prune=1 hit by the heartbeat cron — pick the simpler; no new cron). Verify: typecheck, rebuild, redeploy; insert a fake old doc via `/api/data`, trigger, confirm gone; /pager 200. *(2026-07-08: done in session — prune on ingest: read >30d + system >7d; fake old doc verified deleted)*
- [x] **T15 — Pager unread badge in sidebar** (S) — show the unread count on the Pager entry in `sidebar.tsx` (reuse the pill style from /pager; live via `useNotifications`). Verify: typecheck, rebuild, redeploy, /pager 200, badge visible with an unread message present. *(2026-07-08: done in session — unread pill on the Pager sidebar entry via useNotifications)*
- [x] **T16 — Pager actions v1: ack** (M) — messages gain an optional `actions` field on ingest (`[{label, kind:"ack"}]` only for now); /pager renders the button; "ack" = markRead + append `acked <date>` to the body. NO arbitrary shell/webhook execution — that design is NEEDS-SAMY (see T17). Verify: typecheck, rebuild, redeploy, post a message with an ack action, click it, state persists. *(2026-07-08: done in session — ack actions stored on ingest, button on /pager stamps 'acked <date>' + marks read)*
- [ ] **T17 — NEEDS-SAMY: action dispatcher design + RN companion accounts** (M) — two decisions before the pager can replace Telegram fully: (1) action buttons that touch homelab state (adopt compost proposal, rm strikes) need a dispatcher with a signed-verb allowlist — approve the verb list; (2) the React Native companion (Expo + expo-notifications + share-intent) needs Samy's Google account for FCM and $99/yr Apple dev for iOS push — until then Android push runs via the ntfy app (zero accounts). Decide, then split into executor tasks.

## Log — pager batch (2026-07-08, interactive session)
- T14–T16 executed directly by the session (Samy asked for phone-testable ASAP instead of 3 nightly runs). Retention prunes opportunistically on every POST /api/notify; sidebar shows a live unread pill; ack buttons render on unread messages only and leave an audit stamp in the body. Verified: tsc clean, rebuild, redeploy, fake 10-day-old system doc pruned, actions field persists, /pager 200.
- Pitch: the pager is now self-cleaning, visible from every page, and one-tap ackable — the minimum for daily-driving it over Telegram.
- Quiz: what happens to an unread alerts-stream message after 31 days? (nothing — only READ messages >30d and system >7d are pruned)
