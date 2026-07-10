# Exit velocity — the shipping system

LifeOS historically optimized the safe half of the loop: capture, plan,
prepare. This system rebalances it toward things **leaving** the machine.
Background: perpetual "in progress" is how work avoids being judged;
"done when I'm happy with it" is a threshold that never arrives. The fix is
not motivation, it's defaults — the exposure decision gets made at project
creation (calm), not at ship time (afraid).

## The invariants (enforced in `use-projects.ts`)

1. **Active ⇒ shipping event.** Every active project names its shipping
   event: the concrete external contact point that counts as shipped
   ("demo to one JECT member", "screenshot + writeup posted"). No shipping
   event → the project can be planning/paused, never active.
2. **WIP limit = 3 active projects.** Starting one means shipping or killing
   one. Kills are healthy but logged (`killReason`), never silent drift.

Legacy active projects without a shipping event survive unrelated edits, but
any status/shipping-event change must satisfy the invariant, and the brief's
Exit-velocity card names them until fixed.

## Ship log (`users/local/shipLog`, UI on /projects)

One row per thing that left the machine: date, what, to whom, **predicted**
reaction, **actual** reaction (filled in later — entries glow amber until
reality answers). The predicted-vs-actual column is the point: it makes
prediction error visible, which is what actually updates the "not ready"
instinct.

**Logging rule (added 2026-07-10 after the log sat empty while real work
shipped):** whoever delivers — Samy or an agent session — logs the ship *in
the same session*, via the /projects UI or one command:
`~/services/attention/log-ship.sh "what" "to whom" ["predicted"] [projectId]`.
A shipped thing that isn't logged keeps the tripwire red and teaches everyone
to ignore the metric. What counts: a deliverable reaching its real surface
(deployed and in daily use, a doc delivered for review, a post published, a
demo shown). What does not: commits, refactors, or work on the tracker
itself. Backfills are allowed but must say so in `predictedReaction`.

## Exit-velocity brief card (`brief/fetchers/ships.ts`)

Per active project: days since anything shipped, stalest first. Footer:
ships in the last 30 days. **Tripwire:** 0 ships in 30 days with active
projects turns the card red — that is the signature failure mode (building
the tracker instead of shipping) and the card says so.

## Rules for agents working on this system

- This system graduates on ship-log entries, not on features. Do not extend
  or redesign it before it has produced **3 ship-log entries**.
- When a new feature/project is proposed, ask: what does this help ship,
  and when?
- Celebrate ships, not commits. A rough demo shown to one person outranks a
  week of refactoring.
- First target after deploy: one imperfect thing leaves the machine within
  7 days.
