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
  BLOCKED (2026-07-08): gate not met — the in-app brief was only built 2026-07-07 (commit 21eba5d), so it has run at most since then, nowhere near 3 consecutive days. Left unchecked; re-check after 2026-07-10.
- [x] **T06 — Harden server-db writes** (S) — `src/lib/server-db.ts` opens SQLite with WAL but no `busy_timeout`, and any multi-doc write paths run as separate implicit transactions. Add `pragma busy_timeout = 5000`, and wrap any loop-of-writes in `db.transaction(...)`. Behavior must be identical; no schema changes, no touching the live DB file. Verify: T01's server-db tests still green, typecheck, rebuild, redeploy, create+edit a task via the UI/API smoke. *(2026-07-08: done in autoloop — added `pragma busy_timeout=5000` + a `runInTransaction` helper, wrapped the pager retention prune loop in `api/notify/route.ts` (the only loop-of-writes found) in a single transaction; 38/38 tests green, tsc clean, rebuilt/redeployed, create+edit+delete a task via /api/data verified)*
- [x] **T07 — Unused-export sweep** (M) — run `npx knip` (or `ts-prune`) in `app/`, review the report, and delete only exports/files that are provably unreferenced AND not part of an intentional fallback (Ollama paths, `use-collection` factory surface stay). Blindspot pass mandatory: check the autoloop memory log for anything previously flagged as deliberate before cutting. Verify: typecheck, rebuild, redeploy, smoke every route whose files were touched. *(2026-07-09: done in autoloop — deleted 2 unreferenced files (`components/daily-log.tsx`, `lib/use-profile.ts`) and 18 dead Firestore-shim collection exports from `lib/firestore.ts` (tasks/notes/goals/projects/habits/finance/areas/workouts/workoutTemplates/reminders/bodyMeasurements/recipes/strengthFocuses/learnItems/contentIdeas/contentPosts/getProfile/setProfile) — all superseded by the generic `useCollection` factory; kept dailyLogs/mealPlans/affirmations/primePrompts/principles/primeDays/primeSettings (still imported). Left knip's remaining ~30 flagged exports (training/format.ts, training/stats.ts, brief/builder.ts, local-db.ts, strava-db.ts, area-module.tsx, task-list.tsx, plus type-only exports) untouched — riskier calls (shared-module public surface, possible false positives from knip's static analysis) not worth cutting in one pass; a future task can revisit with more scrutiny per export. 38/38 tests green, tsc clean, docker build succeeds, redeployed, smoked / /prime /tasks /areas /areas/health /workouts /pager all 200. Split into two commits (222 + 245 lines) to stay under the 400-line unattended cap.)*

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

- **2026-07-08 (autoloop, T05 attempted then blocked, T06 done):** T05 was the
  first unchecked non-NEEDS-SAMY task, but its gate (in-app brief running ≥3
  consecutive days) isn't met — `git log` shows the in-app brief build landed
  only yesterday (21eba5d, 2026-07-07), so it can't have 3 days of history
  yet. Left unchecked with a BLOCKED note, moved to T06. `server-db.ts` had no
  `busy_timeout` and, per the task's own description, needed any loop-of-writes
  wrapped in a transaction — a repo-wide grep found exactly one such loop: the
  pager retention sweep (T14) in `api/notify/route.ts`, which deletes docs one
  at a time inside a `for` loop. Added `pragma busy_timeout = 5000` to
  `getDb()` and a `runInTransaction()` helper, and wrapped that prune loop in
  it. No schema/behavior change otherwise.
  **Pitch:** concurrent writers (the pager ingest route firing on every phone
  push, the UI's task/brief writes) now wait up to 5s instead of throwing
  SQLITE_BUSY under WAL contention, and the retention sweep's deletes commit
  atomically instead of as N separate implicit transactions.
  **Quiz:** (1) Which single call site had a loop-of-writes before this task?
  (2) What does `busy_timeout` change about a writer that hits a WAL lock?
  (3) Why couldn't T05 proceed tonight?

- **2026-07-09 (autoloop, T05 re-checked/still blocked, T07 done):** Re-checked
  T05's gate before picking a task: `docker logs lifeos | grep brief-scheduler`
  shows only one scheduled run so far (2026-07-08T21:00:02Z), so the ≥3-day
  bar still isn't met. Left blocked, moved to T07 (first unchecked
  non-NEEDS-SAMY task after T05). Ran `npx knip` in `app/`: 2 unreferenced
  files (`components/daily-log.tsx`, `lib/use-profile.ts` — the latter's
  Firestore auth path is dead since T04 removed firebase.ts) and 50 unused
  exports. Traced the unused exports back to `lib/firestore.ts`'s per-collection
  CRUD objects (`tasks`, `notes`, `goals`, …) — confirmed via grep that every
  hook (`use-tasks.ts`, `use-habits.ts`, etc.) now calls the generic
  `useCollection` factory with a raw collection-path string instead, so this
  whole Firestore-era API surface (18 exports) was genuinely dead, not the
  intentional `use-collection` factory surface the task warned to keep (that
  surface is `createDocument`/`updateDocument`/`deleteDocument`, which
  `use-collection.ts` imports directly and knip correctly did NOT flag).
  Deleted the 2 files and the 18 dead exports; kept `dailyLogs`/`mealPlans`/
  `affirmations`/`primePrompts`/`principles`/`primeDays`/`primeSettings`
  (still imported by their hooks). Left knip's remaining ~30 flags (mostly
  `training/format.ts`, `training/stats.ts`, `brief/builder.ts` internals,
  and type-only exports) alone — those read as a shared-module public API
  rather than provably dead code, and cutting them needs closer per-export
  scrutiny than a first pass warrants. Split the change into two commits
  (222 + 245 lines) to stay under the 400-line unattended cap. 38/38 tests
  green, tsc clean, docker build succeeded, redeployed, smoked
  `/ /prime /tasks /areas /areas/health /workouts /pager` all 200.
  **Pitch:** the app no longer carries a second, unused Firestore-style CRUD
  API alongside the generic collection hook that actually powers every list
  view — one less place for a future edit to silently target dead code.
  **Quiz:** (1) Which generic factory replaced the per-collection `tasks`/
  `notes`/`goals`/… objects, and what does it take as its first argument?
  (2) Which 7 firestore.ts exports were kept, and why? (3) Why was the change
  split into two commits instead of one?

## Pager (homelab notification hub — shipped 2026-07-07: /pager + /api/notify + ntfy push)

- [x] **T14 — Pager retention** (S) — prune pager messages: read messages older than 30 days and `system`-stream heartbeats older than 7 days get deleted server-side (add to the `/api/notify` POST handler as an opportunistic sweep, or a tiny GET /api/notify?prune=1 hit by the heartbeat cron — pick the simpler; no new cron). Verify: typecheck, rebuild, redeploy; insert a fake old doc via `/api/data`, trigger, confirm gone; /pager 200. *(2026-07-08: done in session — prune on ingest: read >30d + system >7d; fake old doc verified deleted)*
- [x] **T15 — Pager unread badge in sidebar** (S) — show the unread count on the Pager entry in `sidebar.tsx` (reuse the pill style from /pager; live via `useNotifications`). Verify: typecheck, rebuild, redeploy, /pager 200, badge visible with an unread message present. *(2026-07-08: done in session — unread pill on the Pager sidebar entry via useNotifications)*
- [x] **T16 — Pager actions v1: ack** (M) — messages gain an optional `actions` field on ingest (`[{label, kind:"ack"}]` only for now); /pager renders the button; "ack" = markRead + append `acked <date>` to the body. NO arbitrary shell/webhook execution — that design is NEEDS-SAMY (see T17). Verify: typecheck, rebuild, redeploy, post a message with an ack action, click it, state persists. *(2026-07-08: done in session — ack actions stored on ingest, button on /pager stamps 'acked <date>' + marks read)*
- [ ] **T17 — NEEDS-SAMY: action dispatcher design + RN companion accounts** (M) — two decisions before the pager can replace Telegram fully: (1) action buttons that touch homelab state (adopt compost proposal, rm strikes) need a dispatcher with a signed-verb allowlist — approve the verb list; (2) the React Native companion (Expo + expo-notifications + share-intent) needs Samy's Google account for FCM and $99/yr Apple dev for iOS push — until then Android push runs via the ntfy app (zero accounts). Decide, then split into executor tasks.

## Log — pager batch (2026-07-08, interactive session)
- T14–T16 executed directly by the session (Samy asked for phone-testable ASAP instead of 3 nightly runs). Retention prunes opportunistically on every POST /api/notify; sidebar shows a live unread pill; ack buttons render on unread messages only and leave an audit stamp in the body. Verified: tsc clean, rebuild, redeploy, fake 10-day-old system doc pruned, actions field persists, /pager 200.
- Pitch: the pager is now self-cleaning, visible from every page, and one-tap ackable — the minimum for daily-driving it over Telegram.
- Quiz: what happens to an unread alerts-stream message after 31 days? (nothing — only READ messages >30d and system >7d are pruned)
- [ ] **T18 — NEEDS-SAMY: LifeOS mobile version** (L) — full mobile app, not just a pager companion (supersedes the RN half of T17; the action-dispatcher half of T17 stands on its own). Direction chosen 2026-07-08: React Native (Expo) on all platforms, native apps possible later. Scope v1 to the daily-driver screens (dashboard, pager, tasks, brief, prime) talking to the existing /api routes over the tailnet (IP-based base URL — phone runs with Tailscale DNS off). Blockers only Samy can clear: Firebase project on his Google account (FCM push), Expo/EAS account (Android builds; $99/yr Apple only when iOS matters). Until then the PWA at http://100.124.149.101:3000 + ntfy push is the interim mobile experience. When unblocked: split into executor-sized tasks (scaffold, auth-less tailnet client, screen ports, push registration).

## Daily planning (spec: `~/loop-me/workflows/daily-planning.md` — grilled and fully resolved with Samy 2026-07-09; read that file before starting any task below, it has the full decision record)

Nine centres (LifeOS, Flux, Ecole, Scout, reels-reader, homelab-infra, workouts, polymath, SWE-learning), folded into the existing 06:00 Morning Brief. Split into independently-executable increments so no single commit approaches the 400-line cap. Do them in order — later tasks depend on earlier ones' output shape.

- [ ] **T19 — NEEDS-SAMY: Google Calendar API credentials** (S) — daily-planning needs to read existing events and write tentative time-blocks. No Google OAuth client exists in `~/.config/homelab/secrets.env` or LifeOS's env today (checked 2026-07-09) — this is a real external dependency + secret, not something an unattended agent may invent. Samy needs to: create a Google Cloud project + OAuth client (or reuse one if he already has one for another purpose — ask before assuming), grant Calendar API scope, and drop the client id/secret/refresh token into `~/.config/homelab/secrets.env`. T23 is gated on this; T20–T22 are not and can proceed in parallel.
- [x] **T20 — Backlog files for untracked centres** (S) — add `workouts.md`, `polymath.md`, `swe-learning.md` to LifeOS's data directory (alongside `data/lifeos.db`, not `~/loop-me/`), each a simple markdown checklist the brief can read/append to, carrying unfinished items across days. No UI needed yet — just the file convention + a small read/write helper in `src/lib`. Verify: typecheck, unit test for the helper (create/append/mark-done/read-unfinished), rebuild. *(2026-07-09: done in autoloop — added `src/lib/backlog.ts` (readBacklog/readUnfinishedBacklog/appendBacklogItem/markBacklogItemDone) storing each centre's items as a markdown checklist file next to `data/lifeos.db` (via the existing `LIFEOS_DB_PATH`-derived `dataDir()` convention from `strava.ts`); files are created lazily on first append, not pre-seeded. 42/42 tests green (4 new backlog tests), tsc clean, docker build succeeds. No route touched, so no redeploy/smoke needed this pass.)*
- [x] **T21 — Todoist centre-inference pull** (M) — using the existing Todoist v1 fetcher (`src/lib/brief/fetchers/work.ts` or sibling — check what's already there from the 2026-07-07 Todoist integration before adding a second client), pull all open tasks and infer a centre (one of the nine) per task from title/content. Cache the inference per task id so it isn't re-run every day. Only surface a task as "needs categorization" when confidence is low — don't gate on 100% coverage. Verify: typecheck, unit test the inference function against a handful of fixture task titles per centre, rebuild. *(2026-07-09: done in autoloop — added `src/lib/brief/centre-inference.ts` (`inferCentre` keyword/word-boundary match over title+description, ambiguous or 0-match tasks come back low-confidence/null centre) with a JSON cache file next to `lifeos.db` (same `dataDir()` convention as T20's `backlog.ts`) keyed by task id + content, so unchanged tasks skip re-inference; `src/lib/brief/fetchers/todoist-centres.ts` pulls all open tasks via Todoist's paginated `/tasks` endpoint (separate from `fetchers/work.ts`'s overdue|today card fetcher) and runs them through the cache. 14 fixture-title tests (one per centre) plus ambiguous/cache-hit/cache-invalidation cases — 56/56 tests green, tsc clean, docker build succeeds. Not wired into the brief UI yet, out of this task's scope — T22+ consumes it — so no redeploy/route smoke this pass.)*
- [x] **T22 — Tracked-centre aggregator** (M) — for LifeOS/Flux/Ecole/Scout/reels-reader: read each project's `ROADMAP.md` (path convention: `~/apps/<project>/ROADMAP.md`) for `NEEDS-SAMY` items + the next unchecked non-NEEDS-SAMY task (same parse LifeOS itself already needs nothing external for — this runs from LifeOS's host context, so file reads are local). For homelab-infra: read `~/infra/goals` standing-goal state for pass→FAIL transitions (top priority) else next NEEDS-SAMY across `~/infra/*/ROADMAP.md`. Output a normalized list of `{centre, title, urgency}` items GitHub issues can be layered onto later — don't build the GitHub-issues half yet, ROADMAP.md + standing-goals is enough for v1. Verify: typecheck, unit test the ROADMAP.md parser against fixture files, rebuild. *(2026-07-09: done in autoloop — added `src/lib/brief/roadmap-parser.ts` (pure `parseRoadmap`: all unchecked NEEDS-SAMY tasks + first unchecked non-NEEDS-SAMY task, same rule the executor itself follows) and `src/lib/brief/fetchers/tracked-centres.ts` (`trackedCentreItems` over LifeOS/Flux/Ecole/Scout/reels-reader ROADMAP.md paths; `homelabInfraItems` checks `~/infra/goals/state/<name>.status` for FAIL first — skipping `retired: true` goals — and only falls back to the first NEEDS-SAMY task discovered across `~/infra/*/ROADMAP.md` when nothing is failing; `aggregateTrackedCentres` concatenates both). All paths are dependency-injected with real-host defaults so the parser/aggregator are unit-testable against fixture files without touching the actual host tree. 66/66 tests green (24 new), tsc clean, docker build succeeds. Not wired into the brief builder/registry yet — same as T21 — since T24 is the checkpoint task that consumes this output; no route touched, so no redeploy/smoke this pass.)*
- [ ] **T23 — Calendar read + tentative block writer (GATED on T19)** (M) — do not start until T19's credentials exist. Read the day's existing events first (hard constraints, never propose over them); write proposed blocks as real tentative calendar events (title-prefix marker, e.g. `〜`) for: fixed 6am workout anchor, 30-min protected minimums for polymath + SWE-learning, then dynamic-priority items from T21+T22 filling 7am–10pm. Verify: typecheck, rebuild, manual smoke against Samy's actual calendar for one day (document the result in the log entry — this one can't be fully verified by an unattended agent alone, flag for a human glance next session if the calendar-write looks wrong).
  BLOCKED (2026-07-09): `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` now exist in `~/.config/homelab/secrets.env`, so T19's literal credential gate is met — but this task's own Verify note requires "manual smoke against Samy's actual calendar," i.e. writing real tentative events to Samy's live Google Calendar as part of a first, unreviewed implementation of a brand-new OAuth+write integration. That's exactly the "live service state" a CLAUDE.md law says never to touch unattended, and there's no one to glance at the design or the written events before they land on his real calendar. Declining to attempt the calendar-write portion autonomously; left unchecked. Recommend Samy either (a) explicitly greenlight autoloop to write to the live calendar for this task, or (b) review a design/dry-run (log intended events instead of writing them) before the real write path runs. Not attempting T24 either since it's gated on T23.
- [ ] **T24 — Checkpoint: fold into Morning Brief + reply handling (GATED on T20–T23)** (M) — add the daily-planning section to the existing brief output (same delivery: pager → Telegram dual-write), listing: today's blocks (referencing the live tentative events), any low-confidence Todoist placements from T21, and an open invite to extend the list. Parse plain-text replies in the pager/Telegram thread for: reschedule ("push X to Ypm"), decline ("won't do X today" → removes the tentative event, leaves source/backlog untouched), placement answers, and free-form additions. Keep intent-parsing as its own function separate from the Telegram ingestion path (voice input is a planned future reply channel — don't hardcode text-only assumptions into the parsing logic itself, just the transport). Verify: typecheck, rebuild, unit tests for the reply parser against fixture replies (one per intent type), manual smoke of one real reply round-trip.

## Log — daily planning
- **2026-07-09 (interactive session, /loop-me grilling):** Samy asked for a daily-organizing/scheduling workflow across all 9 centres of interest — the one thing he still does by hand. Ran a full grilling session (see `~/loop-me/`); every structural decision resolved (trigger, prioritization, calendar-write timing, checkpoint/reply shape, backlog storage, Todoist mapping) — zero open questions left in the spec. Decomposed into T19–T24 above so the nightly autoloop can chew through it incrementally; T19 (Calendar OAuth) is the only real blocker and needs Samy directly.

- **2026-07-09 (autoloop, T05 re-checked/still blocked, T20 done):** Re-checked
  T05's gate first: `docker exec lifeos cat /data/brief.json` shows only one
  in-app-brief generation so far (`generated_at: 2026-07-08T21:00:02Z`, for
  date 2026-07-09) — the legacy `/brief/brief.json` mount's last entry is from
  2026-07-07, predating the in-app brief entirely, so it doesn't count toward
  the 3-day bar. Gate still not met; left T05 blocked. T17–T19 are
  NEEDS-SAMY, so moved to T20, the first unchecked non-NEEDS-SAMY task. Added
  `src/lib/backlog.ts` implementing the "Backlog files" section of the
  daily-planning spec: one markdown-checklist file per untracked centre
  (workouts/polymath/swe-learning), stored next to `data/lifeos.db` via the
  same `LIFEOS_DB_PATH`-derived `dataDir()` pattern `strava.ts` already uses
  for its token file (kept the convention rather than inventing a new one).
  Four functions: `readBacklog`, `readUnfinishedBacklog`, `appendBacklogItem`,
  `markBacklogItemDone` — files are created lazily on first append rather
  than pre-seeded, and a missing file just reads as an empty backlog. Added
  `backlog.test.ts` covering create/append/mark-done/read-unfinished against
  temp dirs (never touches the real data dir). 42/42 tests green, tsc clean,
  docker build succeeds. No UI/route was touched (task explicitly scoped to
  the file convention + helper only), so no redeploy or route smoke this pass.
  **Pitch:** the three centres with no external task source (workouts,
  polymath, SWE-learning) now have a durable place to carry unfinished items
  day to day — the next daily-planning task (T21+) has somewhere concrete to
  read from and write to instead of inventing storage mid-implementation.
  **Quiz:** (1) Where do backlog files live, and what existing convention did
  `dataDir()` reuse? (2) What happens if `readBacklog` is called for a centre
  whose file doesn't exist yet? (3) Why was T05 left blocked again tonight?

- **2026-07-09 (autoloop, T05 re-checked/still blocked, T21 done):** Re-checked
  T05's gate first: `docker exec lifeos cat /data/brief.json` still shows only
  one in-app-brief generation (`generated_at: 2026-07-08T21:00:02Z`), and
  `docker logs lifeos | grep brief-scheduler` shows a single 2026-07-09
  catch-up-skipped line — no third day of history yet, so the ≥3-day bar
  still isn't met. Left T05 blocked. T17–T19 are NEEDS-SAMY; T20 is done; so
  moved to T21, the first unchecked non-NEEDS-SAMY task. Implemented the
  Todoist centre-inference pull per the daily-planning spec's "Todoist
  integration" section: `centre-inference.ts` does a lightweight
  word-boundary keyword match per centre (had to switch from plain substring
  matching after "reels-reader" spuriously matched polymath's "read"
  keyword inside "reader") and caches each task's inference by id in a JSON
  file next to `lifeos.db`, reusing T20's `dataDir()` convention rather than
  writing into the app's SQLite doc store or inventing a new location; a
  cached entry is invalidated automatically if the task's content changed
  since the last run. `fetchers/todoist-centres.ts` pulls *all* open tasks
  via Todoist's paginated `/tasks` endpoint — deliberately separate from
  `fetchers/work.ts`, which only pulls overdue|today for the brief's "Today's
  work" card and stays untouched. Ambiguous (multi-centre match) or
  zero-match tasks come back `{centre: null, confidence: "low"}` per the
  spec's "only ask Samy when genuinely ambiguous" rule — no UI surfaces that
  yet since wiring it into the brief is T22+'s job, not this task's. 14
  fixture-title tests (one per centre) plus ambiguous/description-only/cache-
  hit/cache-invalidation cases: 56/56 tests green, tsc clean, docker build
  succeeds. No route was touched, so no redeploy/smoke this pass.
  **Pitch:** Todoist's flat, uncategorized task list can now be sorted into
  the nine daily-planning centres automatically, with the inference cost
  paid once per task instead of on every brief run, and the plumbing already
  distinguishes "confidently placed" from "needs Samy to decide" per task.
  **Quiz:** (1) Why did "reels-reader" need a word-boundary match instead of
  a plain substring check? (2) Where is the per-task inference cached, and
  what invalidates a cache entry? (3) What does a task get back when it
  matches two centres' keywords at once?

- **2026-07-09 (autoloop, T05 re-checked/still blocked, T22 done):** Re-checked
  T05's gate first: `docker exec lifeos cat /data/brief.json` still shows
  only one in-app-brief generation (`generated_at: 2026-07-08T21:00:02Z`),
  and `docker logs lifeos | grep brief-scheduler` shows only a next-run
  countdown for tonight's 06:00 JST slot — no third day of history yet, so
  the ≥3-day bar still isn't met. Left T05 blocked. T17–T19 are NEEDS-SAMY;
  T20–T21 are done; so moved to T22, the first unchecked non-NEEDS-SAMY
  task. Implemented the tracked-centre aggregator per the daily-planning
  spec: `src/lib/brief/roadmap-parser.ts` is a pure `parseRoadmap(contents)`
  that walks `- [ ]`/`- [x]` task lines and returns every unchecked
  NEEDS-SAMY title plus the first unchecked non-NEEDS-SAMY title (the exact
  "first match wins" rule this executor itself follows), so it needs no
  filesystem access and is trivially fixture-testable.
  `src/lib/brief/fetchers/tracked-centres.ts` layers file I/O on top:
  `trackedCentreItems` reads LifeOS/Flux/Ecole/Scout/reels-reader's
  `~/apps/<project>/ROADMAP.md` (paths dependency-injected, defaulting to the
  real host tree) and emits one item per NEEDS-SAMY task plus one for the
  next task; `homelabInfraItems` reads `~/infra/goals/state/<name>.status`
  for any `FAIL` (skipping goals marked `retired: true`) — if any goal is
  failing, that's the *only* output (top priority per the spec), otherwise
  it walks `~/infra/*/ROADMAP.md` and returns the first NEEDS-SAMY task
  found. `aggregateTrackedCentres` concatenates both. Not wired into the
  brief builder/registry yet — same posture as T21's `todoist-centres.ts` —
  since T24 is the checkpoint task that actually consumes this output; the
  container also doesn't mount `~/apps`/`~/infra` today, so wiring it live
  is deferred to whichever task adds that mount. 24 new tests (parser
  fixtures covering checked/unchecked/NEEDS-SAMY/dropped-task lines; the
  aggregator against temp-dir fixture ROADMAPs and goal-state files,
  including the retired-goal-skip and violation-beats-NEEDS-SAMY cases):
  66/66 tests green, tsc clean, docker build succeeds. No route was
  touched, so no redeploy/smoke this pass.
  **Pitch:** every tracked project's open decisions and next task can now be
  pulled into one normalized list with a single pure-function parser reused
  across all five projects plus homelab-infra, instead of each future
  consumer re-implementing ROADMAP.md parsing.
  **Quiz:** (1) What single rule does `parseRoadmap`'s `nextTask` selection
  share with the nightly executor itself? (2) Why does `homelabInfraItems`
  return *only* violations when one exists, instead of violations plus the
  next NEEDS-SAMY task? (3) Why isn't the aggregator wired into the brief
  registry yet?

- **2026-07-09/10 (autoloop, T05 re-checked/still blocked, T23 declined):**
  Re-checked T05's gate first: `docker exec lifeos cat /data/brief.json` still
  shows only one in-app-brief generation (`generated_at:
  2026-07-08T21:00:02Z`) — tonight's 06:00 JST run hadn't landed yet at
  autoloop time, so still no third day of history. Left T05 blocked. T17–T19
  are NEEDS-SAMY; T20–T22 are done; T23 is the first unchecked
  non-NEEDS-SAMY task. Checked its gate: `grep GOOGLE_CALENDAR
  ~/.config/homelab/secrets.env` shows `GOOGLE_CALENDAR_CLIENT_ID/_SECRET/
  _REFRESH_TOKEN` are now present (Samy must have added them since T19 was
  written), so the literal credential gate is met. But no calendar
  integration code exists anywhere in the repo yet, and the task's own Verify
  note requires writing real tentative events to Samy's actual live Google
  Calendar as the smoke test for a brand-new, never-reviewed OAuth+write
  path — exactly the kind of unattended live-service-state mutation
  CLAUDE.md's homelab constitution says never to do without asking first.
  Declined to implement/attempt the write path autonomously; added a BLOCKED
  note to T23 recommending Samy either explicitly greenlight the live write
  or ask for a dry-run/log-only first pass. T24 is gated on T23 so also
  untouched. No code changes made tonight (nothing to revert); ROADMAP.md is
  the only file touched, tree otherwise clean.
  **Pitch:** the one real blocker left on daily-planning (Google Calendar
  OAuth) turned out to already be cleared by Samy, but the next step writes
  to his real calendar for the first time ever — that's a judgment call worth
  a human's explicit yes, not something to slip through on gate-technicality.
  **Quiz:** (1) Which three env vars now exist in secrets.env that didn't
  before T19 was written? (2) Why did the agent decline T23 even though its
  literal credential gate was satisfied? (3) What are the two options given
  to Samy to unblock T23?
