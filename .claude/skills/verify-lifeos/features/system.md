# System

Homelab health, containers, workflows and alerts.

## Sub-features

- `system-render` health panels render

## How to get to it (user POV)

- Nav item `System`.
- Open `/status`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `System`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature system`.

## Gotchas

- Prometheus and the Docker socket are unreachable in the jail; panels must say so, not crash.
