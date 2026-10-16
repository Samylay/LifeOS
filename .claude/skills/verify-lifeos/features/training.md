# Training

Workouts, plan and activity history (Strava data in the snapshot).

## Sub-features

- `training-render` the plan and history render

## How to get to it (user POV)

- Nav item `Training`.
- Open `/workouts`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Training`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature training`.

## Gotchas

- Strava sync needs the network; it is blocked.
