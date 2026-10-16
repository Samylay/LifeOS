# Assistant

Chat with the assistant; history persists per conversation.

## Sub-features

- `chat-render` composer and history
- `chat-send` a message is stored and shown

## How to get to it (user POV)

- Nav item `Assistant`, or the `Assistant` button in the top bar.
- Open `/chat`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Assistant`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature assistant`.
- **Send.** Type into the composer and press Enter; the user message appears and persists after reload. The reply fails in the sandbox (no generation backend).

## Gotchas

- Generation goes to the Codex bridge, which the jail blocks. Check how the failure is shown, not the answer.
