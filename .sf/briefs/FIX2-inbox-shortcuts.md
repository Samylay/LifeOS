# Brief: FIX2 one shortcut reader, so Ctrl/Cmd/Alt combos never record a verdict (finding CU-03)

- GOAL: on /decide, browser and OS shortcuts (Ctrl+A, Ctrl+X, Cmd+A, Alt+X, Ctrl+D) and held-key repeats never record an Inbox verdict; plain a/d/x/j/k and the deck's arrow keys keep working.
- SCOPE: may write `app/src/lib/keyboard.ts` (new), `app/src/lib/keyboard.test.ts` (new), `app/src/app/decide/page.tsx`, `app/src/components/decide/card-stack.tsx`, `.sf/rules/` (a rule and its fixture), the rule table in `CLAUDE.md`. Nothing else.
- CONTEXT: two handlers implement the same rule differently (pitfall class C3): `card-stack.tsx` ignores modifiers, `decide/page.tsx` reads `event.key` alone. Repro: `drive.mjs --feature inbox-shortcuts` (committed failing at ca829e0: 5 modifier combos each POSTed `/api/decide/verdict`).
- DATA SHAPE: `pageShortcut(event: KeyboardEvent): string | null`, the only reader of single-key page shortcuts.
- ACCEPTANCE (pass/fail):
  - `drive.mjs --feature inbox-shortcuts` PASS at desktop: 0 verdict POSTs for the combos, exactly 1 for plain `d`.
  - `keyboard.test.ts` passes; `.sf/bin/rules` has 0 findings in app/src and the new rule `page-shortcut-helper` fires on the ca829e0 excerpt (a real past mistake).
  - verify:all: no new failure (only the 5 known D6 failures).
- PROOF WANTED: failing-then-passing journey, rule fixture output, verify:all summary.
- VERIFY: `cd app && npx vitest run src/lib/keyboard.test.ts && npm run verify:all`.
- CONSTRAINTS: under 200 changed lines, no new dependency, no existing test edited.
- FORBIDDEN: push, deploy, edits outside SCOPE.
- REPORT: files, commands and results, deviations.
