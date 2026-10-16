# Settings

App settings.

## Sub-features

- `settings-render`

## How to get to it (user POV)

- Nav item `Settings`.
- Open `/settings`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Settings`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature settings`.

## Gotchas

- Push subscription needs a browser push service; blocked.
