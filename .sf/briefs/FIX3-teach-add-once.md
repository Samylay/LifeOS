# Brief: FIX3 adding a learning topic is idempotent (findings CU-04, CU-06)

- GOAL: a triple click on "Add to queue", or the same topic proposal accepted several times, leaves exactly one queued learning topic. Topics cannot be deleted from the UI, so duplicates must not be created.
- SCOPE: may write `app/src/lib/teach.ts` (`addTopic`), `app/src/components/teach/teach-section.tsx` (the add handler and its two Add buttons), a new test `app/src/lib/teach.add-topic.test.ts`. Nothing else.
- CONTEXT: `addTopic()` always calls `createDoc`. Its callers: `POST /api/teach` (addTopic), `lib/proposals.ts` (accepting a `topic:<tag>` proposal), `lib/homelab-tools.ts` (assistant tool). The client `add()` has no in-flight guard. Repro: `drive.mjs --feature teach-add-once` (committed failing: 2 topics from a triple click, 3 from three accepts).
- DATA SHAPE: a queued topic request is identified by its topic, mission (trimmed, case-folded, spaces collapsed) and sorted tags. `addTopic` returns the id of an existing queued topic with the same key instead of creating one. Completed or archived topics do not block a new one.
- DEVIATION (logged): a first version keyed on the topic text alone made an existing test fail (`teach.test.ts` reuses "learn rust" with different tags and expects separate topics). The key now covers the whole request, which still removes every duplicate the findings describe; the existing test was not touched.
- ACCEPTANCE (pass/fail):
  - `drive.mjs --feature teach-add-once` PASS: 1 topic after the triple click, 1 after three accepts.
  - Unit test: two `addTopic` calls with the same request (different case and spacing) return the same id and leave one document; a different mission or tag set is a new topic; a topic whose status is not `queued` does not block a new one.
  - verify:all: no new failure (only the 5 known D6 failures).
- PROOF WANTED: failing-then-passing journey, unit test output, verify:all summary.
- VERIFY: `cd app && npx vitest run src/lib/teach.add-topic.test.ts && npm run verify:all`.
- CONSTRAINTS: under 200 changed lines, no new dependency, no existing test edited. Do not add a delete feature (product call, see ticket).
- FORBIDDEN: push, deploy, edits outside SCOPE.
- REPORT: files, commands and results, deviations.
