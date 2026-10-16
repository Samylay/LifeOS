# SF plan playbook

Use this before building anything bigger than one unit. It sits in front of the pstack
playbooks (`.claude/skills/poteto-mode/playbooks/`), it does not replace them.

## 1. Route the question

| The open question is... | Route to | Output |
|---|---|---|
| Many decisions, fog, more than one session of work | `wayfinder` (map of decision tickets) | `.sf/map.md` with Destination, Decisions so far, Not yet specified, Out of scope |
| A product call: name, features, design, scope | `grilling` (one round per frontier) | A numbered round with a recommended answer per question |
| A fact you can observe by running something | pstack Prototype playbook | The observed result, not a question |
| A code change with a known shape | pstack Feature or Bug fix playbook | A brief in `.sf/briefs/` |

## 2. Wayfinder in a repo with no issue tracker

Use the local-markdown tracker: one file `.sf/map.md` is the map, each ticket is a
`## Ticket: <name>` section with `Type`, `Status`, `Blocked by`, `Question`, `Answer`.
Resolve one decision ticket at a time. A resolved ticket gets one line in
"Decisions so far".

## 3. Grilling when the human is away

Grilling is HITL. Normal runs stop and ask Samy. In a delegated run (benchmark, or an
explicit "decide everything" grant) the agent writes the round, answers each question
with its recommended answer, and logs every answer in `.sf/DECISIONS.md` with one line of
reasoning. Mark these answers `self-answered` so Samy can overturn them.

## 4. Hand off

Every unit that leaves planning gets a brief from `.sf/briefs/TEMPLATE.md` before any
code is written. No brief, no spawn.
