# Inbox

Decision cards from triage: approve an action, undo it, give short feedback.

## Sub-features

- `inbox-render` the card stack or the empty state
- `inbox-approve` approving a card performs its action
- `inbox-undo` undo reverses our own artifact

## How to get to it (user POV)

- Nav item `Inbox`.
- Open `/decide`. `/decide/approvals`, `/decide/dispatch`, `/decide/extracts` redirect here.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Inbox`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature inbox`.
- **Approve.** Not scripted yet: the snapshot queue was empty on 2026-10-17. Report it as unreachable, never as verified.

## Gotchas

- Approval needs a feedback answer since 37522f8; 5 tests in `homelab-resources.test.ts` still expect the old flow.
