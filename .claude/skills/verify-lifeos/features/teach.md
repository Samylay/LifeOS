# Teach

Teaching sessions on saved topics.

## Sub-features

- `teach-render`

## How to get to it (user POV)

- Open `/knowledge/teach`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Teach`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature teach`.

## Gotchas

- Session pages need a teach session id from the list; never read the DB to find one.
