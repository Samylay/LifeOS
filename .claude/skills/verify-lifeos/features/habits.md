# Habits

Habit definitions and history.

## Sub-features

- `habits-render`
- `habits-malformed` a habit with a non-array history must not crash Today or Habits (finding HI-1)
- `habits-toggle` a check-in persists

## How to get to it (user POV)

- From Settings.
- Open `/settings/habits`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Habits`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature habits`.

## Gotchas

- Same `history` shape hazard as Today (HI-1).
