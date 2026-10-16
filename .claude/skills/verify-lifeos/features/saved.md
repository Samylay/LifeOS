# Saved

Saved items from bookmarks and captures, 7-day default view.

## Sub-features

- `saved-render`

## How to get to it (user POV)

- From Inbox or Today links.
- Open `/saved`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Saved`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature saved`.

## Gotchas

- Slow on the snapshot: 3 to 6 s per load (field-test finding PU-1).
