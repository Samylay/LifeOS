# Shopping

Shopping list and pantry: add free text, check, remove, low-stock add.

## Sub-features

- `shopping-add` free text becomes entries
- `shopping-check` checking persists
- `shopping-remove` removing deletes
- `pantry` pantry stock and low-stock add

## How to get to it (user POV)

- From Training.
- Open `/shopping`.

## Driving it with drive.mjs

Preconditions: sandbox doctor OK; `SF_BASE_URL` set. Every journey also asserts h1 `Shopping`, no page error, no 5xx, no horizontal overflow.

- **Add, check, remove.** `drive.mjs --feature shopping`. Fills the `Add to the list` textbox with `sf probe zz`, presses Enter, confirms one entry in `GET /api/shopping`, checks it (`aria-checked=true`, persisted), removes it, confirms it is gone.

## Gotchas

- Use only synthetic text. The probe item is removed by the journey itself.
