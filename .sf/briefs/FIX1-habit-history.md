# Brief: FIX1 habit documents are parsed at the read boundary (finding HI-1)

- GOAL: a habit document with a malformed `history` (not an array, or entries of the wrong shape) never crashes Today or Habits; it shows as a habit with no recorded completions.
- SCOPE: may write `app/src/lib/habit-schedule.ts`, `app/src/lib/use-habits.ts`, `app/src/app/settings/habits/page.tsx` if it reads raw docs, and a new test `app/src/lib/habit-schedule.parse.test.ts`. Must not touch the data API, other collections, or existing tests.
- CONTEXT: `useHabits()` casts `useCollection<HabitWithArea>("habits")` straight to the `Habit` type. `/api/data/[...path]` stores any JSON (finding HI-2). Consumers call `history.some/filter/find/map`. Repro: `.claude/skills/verify-lifeos/drive.mjs --feature habits-malformed` (committed failing at 5bb1abc).
- DATA SHAPE: `Habit` in `app/src/lib/types.ts`; new `parseHabit(doc): HabitWithArea` returns a value whose `history` is always `{ date: string; completed: boolean }[]` and `streak` a finite number.
- ACCEPTANCE (pass/fail):
  - `drive.mjs --feature habits-malformed` PASS (was FAIL at 5bb1abc).
  - New unit tests: history `{}`, `null`, `"x"`, and an array with junk entries all parse to a safe array; a valid habit is returned unchanged.
  - verify:all: no new failure; the 5 known `homelab-resources.test.ts` failures (D6) unchanged.
- PROOF WANTED: failing-then-passing journey output, unit test output, verify:all summary.
- VERIFY: `cd app && npx vitest run src/lib/habit-schedule.parse.test.ts && npm run verify:all`.
- CONSTRAINTS: under 200 changed lines. No new dependency. Never edit or weaken an existing test.
- FORBIDDEN: push, deploy, edits outside SCOPE.
- REPORT: files, commands and results, deviations.
