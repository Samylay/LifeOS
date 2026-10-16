---
name: verify-lifeos
description: "Drive LifeOS (Next.js web app, app/) the way a user does, in an isolated sandbox with no network and a copy of a database snapshot, and capture evidence. Use to prove any LifeOS UI or API change works, before claiming done, and for the verify:all gate."
---

# verify-lifeos

LifeOS is a single-user Next.js 16 app with a SQLite store. Users touch the web UI (phone first, desktop too). This skill launches a production build in a jail, drives it with Playwright on the host's Chrome, and saves evidence. Generated with pstack `/create-verification-skill` (field test 1, 2026-10-17).

## Launch

From the worktree root:

1. Once per machine: `(cd .sf/adversarial && npm ci)` (playwright-core, ast-grep) and `.sf/bin/sandbox native` (better-sqlite3 for Node 22, the production Node).
2. After code changes: `.sf/bin/sandbox build`. It runs `next build` in a bwrap jail with no network and no `.env`, and refuses if any `.env*` file exists in `app/`.
3. `SF_SANDBOX_NAME=<you> SF_SANDBOX_PORT=<port> .sf/bin/sandbox start`. It copies `$SF_SANDBOX_DATA/pristine/lifeos.db` (default `~/apps/lifeos-sf-field-data`) into a fresh run dir, starts `node server.js` inside the jail on Node 22, and bridges it to `127.0.0.1:<port>` (default 3110). Ready means `GET /` returned 200; the command waits up to 60 s and prints `sandbox: ready at ...`.

No snapshot? `start` stops with "no snapshot". Make one with SQLite's backup API from a backup copy, source opened `mode=ro`, never from the live container, and keep it chmod 400 outside every git repo.

## Doctor

`SF_SANDBOX_NAME=<you> .sf/bin/sandbox doctor`. Read only. It checks the jail process is alive, the port is held by our bridge pid, `GET /` is 200 and the outbound guard is loaded. Run it first whenever anything looks off. `.sf/bin/sandbox canary` proves the jail cannot reach the internet.

## Drive

`SF_BASE_URL=http://127.0.0.1:<port> node .claude/skills/verify-lifeos/drive.mjs --feature <name> [--viewport phone|desktop|both]`, or `--all`. `--list` prints the features. Each journey opens the route, waits for the page `h1` by role and name, checks horizontal overflow, runs the feature's own user path, then checks there was no uncaught page error and no 5xx. Selectors are roles and accessible names (`getByRole("textbox", { name: "Add to the list" })`), never coordinates.

For ad hoc driving, import the harness: `import { startPersona, VIEWPORTS } from "./.sf/adversarial/lib.mjs"`, then `p.go(route)`, `p.page` (Playwright), `p.shot(name)`, `p.finish()`.

## Evidence

- Proof standard: exercise the real user path, not test endpoints or internal setters. Capture the action and the resulting state. Verify side effects through the API (`GET /api/shopping` after an add) as well as on screen.
- Every run writes `$SF_EVIDENCE_DIR/verify-lifeos/<feature>-<viewport>/<run>/journal.json` (steps, checks, console errors, page errors, failed requests, 4xx/5xx, blocked outbound requests) and screenshots. `summary-latest.json` sits next to them. Default `$SF_EVIDENCE_DIR` is `~/apps/lifeos-sf-field-data/evidence`.
- Screenshots of the snapshot hold personal data. Only `*.redacted.png` copies (all text masked) may leave the evidence dir.
- Side effects are cut, and that is checked, not assumed: `SF_SANDBOX_NAME=<you> .sf/bin/sandbox outbound` lists every outbound attempt the server made (all fail in the jail), and the journal lists every browser request that tried to leave 127.0.0.1.

## Cleanup

`SF_SANDBOX_NAME=<you> .sf/bin/sandbox stop` kills only the jail and bridge pids it started (from `run.json`), deletes the server copy, and keeps `outbound.jsonl`, `server.log` and the run's database copy. Evidence under `$SF_EVIDENCE_DIR` is never deleted. Never kill by process name: other agents run their own instances.

## Helpers

- `.sf/bin/sandbox` (build, native, start, doctor, canary, outbound, stop).
- `drive.mjs` (journeys, `--self-test` proves a missing page fails).
- `.sf/adversarial/lib.mjs` (harness, redaction).

## Gotchas

- The jail has no network by design. `/api/codex/sessions` returns 502 there; it is the only allowlisted 5xx in `drive.mjs` (`OFFLINE_5XX`), a recorded gap, not a pass. Generation, Todoist, bank, Strava, push and Prometheus calls all fail.
- Next infers the workspace root from `~/package-lock.json`; `sandbox build` masks it inside the jail so `server.js` lands at the standalone root.
- Node 24 with better-sqlite3 11 aborted the server once (`RemoveEnvironmentCleanupHook`). The sandbox runs Node 22 like production.

## Feature map

`features/README.md`, one file per user-facing feature. Keep it current with `/maintain-verification-skill`.
