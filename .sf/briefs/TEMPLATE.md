# Brief: <unit id> <short name>

Adapted from the pstack orchestrate brief. A field you cannot fill means the unit is not
scoped yet. Missing fields are a refuse-to-spawn condition.

- GOAL: one sentence, the outcome, executable by a stranger with no chat access.
- SCOPE: paths this unit may write; paths it must not touch.
- CONTEXT: file pointers; upstream reports pasted in full when this unit depends on them.
- DATA SHAPE: the named type or structure the code is organized around.
- ACCEPTANCE (pass/fail done check): checkable criteria, one per line.
- PROOF WANTED: the artifact that proves it (command output, test names, screenshot path).
- VERIFY: exact commands. Always includes `npm run verify:all`.
- CONSTRAINTS: hard limits, dependencies allowed, no test weakening.
- TIMEBOX: rough cap. On expiry return partial results and stop.
- FORBIDDEN: no push, no remote, no global config, no edits outside SCOPE, no weakening checks.
- REPORT: status, files changed, commands run with results, deviations, follow-ups.
