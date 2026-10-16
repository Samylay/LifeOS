# Brief: adversarial persona run (shared part)

Adapted from `.sf/briefs/TEMPLATE.md`. Each persona agent gets this file plus its own persona block.

- GOAL: as your persona, try to break LifeOS running in your own sandbox, and return confirmed findings with evidence and a deterministic repro.
- SCOPE: you may write only `.sf/adversarial/personas/<persona>.mjs` (your journey script) in the worktree `/home/quorky/apps/lifeos-sf-field`, and anything under `$SF_EVIDENCE_DIR/<persona>/` (default `/home/quorky/apps/lifeos-sf-field-data/evidence/<persona>/`). Never edit app code, tests, `.sf/bin`, `lib.mjs` or another persona's files. Never commit.
- CONTEXT:
  - App: LifeOS, Next.js 16, single user, data from a read-only snapshot copy. Pages: `/ /chat /decide /decide/approvals /decide/calibrate /decide/dispatch /decide/extracts /decide/sources/[id] /finance /knowledge/teach /knowledge/teach/[id] /pager /saved /settings /settings/habits /shopping /status /workflows /workouts`. API routes: `app/docs/routes.json` (81). Source: `app/src/`.
  - Sandbox: `SF_SANDBOX_NAME=<persona> SF_SANDBOX_PORT=<port> .sf/bin/sandbox start|doctor|stop|outbound`. Each start copies a fresh snapshot, so restart to get clean state. The sandbox has no network: Codex, Todoist, Google, bank, push, Telegram and Prometheus calls all fail by design. That is not a finding by itself; how the UI reports such a failure can be (a silent failure, a fake success, a spinner forever, a crash).
  - Harness: `import { startPersona, VIEWPORTS } from "../lib.mjs"` (playwright-core, system Chrome). `p.go(route)`, `p.step(text)`, `p.shot(name)` (writes a raw and a `.redacted.png` copy), `p.finding({...})`, `p.finish()` (writes `journal.json` with console errors, page errors, failed requests, 4xx/5xx and blocked outbound requests). Set `SF_BASE_URL=http://127.0.0.1:<port>`. Use `p.page` for any Playwright call. Run with `node .sf/adversarial/personas/<persona>.mjs`.
- DATA SHAPE: write `$SF_EVIDENCE_DIR/<persona>/findings.json`, an array of `{ id, title, severity, route, steps[], expected, actual, reproCount, reproCommand, evidence[] }`. Severity: `S1` crash, data loss, security or a side effect escaping; `S2` a feature broken for its main use; `S3` degraded or misleading UX; `S4` cosmetic. `evidence` lists redacted screenshot paths and journal paths.
- ACCEPTANCE:
  - Your script runs end to end and exits 0 (findings are data, not script failures).
  - Every finding reproduced at least twice, the second time from a freshly restarted sandbox when state matters. `reproCount` says how many times. Unconfirmed observations go in a separate `unconfirmed.json`.
  - Every finding names the observable expected and actual behaviour, and the exact steps.
- PROOF WANTED: `findings.json`, the journals, redacted screenshots.
- VERIFY: `node .sf/adversarial/personas/<persona>.mjs; echo $?` exits 0, and `.sf/bin/sandbox outbound` (with your SF_SANDBOX_NAME) shows only blocked attempts.
- CONSTRAINTS:
  - Never use port 3000 or the live LifeOS, never `docker`, never read `.env` or secret files, never start a sandbox without `SF_SANDBOX_NAME` set to your persona.
  - Privacy: the sandbox holds real personal data. Never copy page text, names, amounts, messages or titles from the data into your script, your findings or your final report. Describe things by shape ("the first transaction row", "a saved item card"). Type only synthetic input. Raw screenshots stay in the evidence dir; cite the `.redacted.png` copies.
  - No new dependency. No skipping or weakening anything.
- TIMEBOX: about 45 minutes. On expiry, write what you have and stop.
- FORBIDDEN: push, commits, edits outside SCOPE, any network target other than your sandbox port, stopping another persona's sandbox, `pkill`/`killall` by name.
- REPORT (final message, under 40 lines): findings table (id, severity, title, reproCount), unconfirmed count, script path, evidence dir, the `sandbox outbound` summary, and confirmation you ran `sandbox stop`.
