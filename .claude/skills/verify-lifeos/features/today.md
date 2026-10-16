# Today

The home page: date, training ring, food today, today's work, daily leak, quarter goals.

## Sub-features

- `today-render` the dashboard renders its sections
- `today-meal` the Log a meal action opens
- `today-goals` quarter goals list

## How to get to it (user POV)

- Nav item `Today` (sidebar on desktop, bottom bar on phone).
- Open `/`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Today`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature today`. The h1 `Today` appears, no page error, no 5xx.

## Gotchas

- A habit document whose `history` is not an array crashes this page (field-test finding HI-1).
- Fetchers that need the network show a warning line; that is expected in the sandbox.
