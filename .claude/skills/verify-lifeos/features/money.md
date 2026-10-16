# Money

Accounts, transactions, classification overrides.

## Sub-features

- `money-render` accounts and transactions
- `money-classify` an override persists

## How to get to it (user POV)

- Nav item `Money`.
- Open `/finance`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Money`, no page error, no 5xx, no horizontal overflow.

- **Render.** `drive.mjs --feature money`.

## Gotchas

- Bank sync needs the network; the five-hour scheduler logs blocked attempts.
