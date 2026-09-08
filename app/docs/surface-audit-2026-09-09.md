# Surface audit, 2026-09-09

## Scope

Reviewed LifeOS route surfaces and their local feature components. Finance, Decide, global CSS, and shared primitives were excluded because they were owned by concurrent work. A narrowly scoped Assistant request-isolation fix was included after it was released from shared-shell ownership.

## Changes made

| Surface | Finding | Change |
| --- | --- | --- |
| Today | A failed initial brief request left a dead-end sentence. | Added an in-place Retry control that keeps the existing loading state and refresh affordance. |
| Today hydration | The server rendered its own clock while the browser rendered the user’s local clock, causing React to discard Today’s server HTML. | Made the first render clock-free, then hydrate the local greeting/date and refresh it once a minute so it also updates across midnight. |
| Voice | A failed recent-captures request could leave the list loading forever. | Check the response, end loading on failure, and show a retryable error state. |
| Knowledge | A failed Teach API request looked like an empty learning queue. | Added compact loading placeholders plus a clear retry state. |
| News | A failed edition request looked like no edition had been generated. | Treat non-success responses as errors and show a retryable load state. |
| Diagrams | History fetch failures were invisible. Deletion updated the UI even when the request failed, and the delete affordance was a non-semantic nested interactive control. | Added history error recovery, only update local history after a successful delete, and made selection and removal separate accessible buttons. |
| Knowledge search | A transient fetch failure was presented as an unmounted vault, and a slow older search could replace newer results. | Kept service configuration separate from request failure, added retry, and cancel in-flight searches when the query changes. Search now names its result count. |
| Training program | Logging a workout required one write per exercise, and rapid taps could duplicate writes or seed multiple default plans. | Added a guarded `Log N remaining` action for today only, skips exercises already logged on the current local day, and disables an exercise while its write runs. Program and strength default setup and logging now guard against repeated taps. |
| Assistant shell | Clearing the conversation while a reply streamed could allow the old reply or its client-side actions to land in the newly cleared session. | Every Assistant request now has an identity. Clear invalidates and aborts the prior request, and only the current request can update status, execute actions, append messages, or change loading state. |
| Status | Poll, visibility refresh, and manual refresh could overlap, letting an older health response overwrite a newer one. | Added request ordering so only the latest response can update health, error, timestamp, or refresh state. |

These changes use existing Mira `Button` and `Card` components. New feedback stays within the daily-surface motion rules: no layout animation, no `transition-all`, and press feedback remains on actions.

## Reviewed surfaces

| Surface | Result |
| --- | --- |
| Today | Fixed brief recovery. Existing habits, reminders, Prime entry, goals, and brief hierarchy already give one clear next action. |
| Projects | No change. Derived project state, scan status, retry, explicit stall reason, and undoable archiving already cover the main workflows. |
| Knowledge | Fixed learning-queue recovery, search request recovery, and stale-result cancellation. Note search now reports matching-note count without hiding suggestions on an empty result. |
| Training and workouts | Added safer workout logging. The current program now offers one action to log only the exercises not yet logged today, with local-day checks that remain correct around midnight. Strength and program actions prevent duplicate writes while one is pending. Garmin reconnect messaging, Strava analytics states, nutrition, and program seeding retain their existing recovery paths. |
| Voice | Fixed recent-list recovery. The capture, review, routing correction, retry-transcription, and discard flows already preserve recoverable takes. |
| Feed | No change. It distinguishes loading, empty, error, exhausted, and generation states, with quiz actions visible rather than gesture-only. |
| Recipes | No change. Reviewed as a saved-post surface owned by concurrent work. |
| News | Fixed edition recovery. The existing two-tap regeneration guard remains unchanged because generation may take minutes. |
| News feeds | No change. Feed activation and add/remove controls are direct and concise. |
| Shared shell and Assistant | Fixed clear-session isolation and stale response protection. Navigation already has skip content, responsive drawer semantics, active-route state, and a mobile safe area. |
| Status | Fixed stale polling protection. Health and alert inbox states expose unread alerts, missing alert bodies, deep links, and mark-read actions. |
| Settings | No change. Connections, notifications, and explicit one-tap recovery actions are already surfaced without hiding service state. |
| Leads | No change. The capped action list, source context, outcomes, pass reasons, and confirmed deletion flow remain direct. |
| Terminal | No change. Reviewed for command status and error handling; no isolated, evidence-backed usability defect found. |
| Prime and Prime banks | No change. Ritual progress, reset confirmation, and bank editing are clearly separated. |
| Diagrams | Fixed history recovery and deletion integrity. Prompt, voice dictation, generation state, copy, and SVG download remain unchanged. |

## Verification

- `git diff --check` passed.
- `npx tsc --noEmit` passed after the concurrent Finance type fix landed.
- Focused ESLint passed for the changed Today, Voice, Knowledge, News, Diagrams, Program, Strength, and knowledge-hook files.
- Deterministic tests cover program logging: local-day boundaries, already-logged exclusion, partial failures, synchronous failures, and waiting for every request to settle. Knowledge request tests cover abort classification and reject late responses.
- Isolated browser smoke at `http://127.0.0.1:3105` covered 17 non-Finance/Decide routes at 1440px and 390px. Every route rendered exactly one `main`; no route had horizontal overflow. The harness intercepted every non-GET API request and supplied only local synthetic GET responses. It also verified failed-request recovery for Today brief, Voice recent captures, Knowledge, News edition, and Diagram history. No mutation request was allowed or attempted after populated catalog and Prime fixtures were added.
- An earlier smoke found a Today hydration exception: production React error `#418` with `HTML` arguments. The direct `new Date()` calls in Today’s first render were the concrete server/client mismatch. The final rebuilt preview passed the same isolated smoke with no browser errors after the clock-free first render fix.
- Re-run script: `.scratch/mira-redesign/surface-smoke-20260909.mjs`. Screenshots and JSON results are ignored under `.scratch/mira-redesign/`; no model-generation, mutation API, database, vault, environment, service, or live-browser writes were run.

## Final live-content correction

A GET-only production check at 320px found two additional overflow sources
that the synthetic fixtures did not expose: the Today header inherited a
448px minimum width from a long learning-progress line, and a saved-item
destination badge used `whitespace-nowrap`. The header now permits shrinking
and the destination wraps without changing its text. No content was edited.
