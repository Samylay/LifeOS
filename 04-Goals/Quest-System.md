# Quest Cascade System

## How It Works

Every quarter runs on a **cascade**: Annual Goals → Quarterly Quests → Weekly Sprints → Daily Tasks. Each level feeds the one below it.

```
Annual Goal
  └── Quarterly Quest (90 days, 1 clear outcome)
        └── Weekly Sprint (7 days, 1 milestone)
              └── Daily Tasks (concrete actions)
```

### The Rule

- **Annual goals** answer: "What do I want to be true by December?"
- **Quarterly quests** answer: "What's the one thing I can finish in 90 days that moves me toward that goal?"
- **Weekly sprints** answer: "What milestone proves I made progress this week?"
- **Daily tasks** answer: "What's the one action I do today for this quest?"

---

## Quest Structure

### Quest Definition

Every quest has these fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Short, clear | "Swimming" |
| **Category** | Life or Work | Life |
| **Area** | Which life area it belongs to | Health |
| **Parent Goal** | Annual goal it serves | "Triathlon training consistency" |
| **Success Criteria** | What "done" looks like, measurable | "Swim 3x/week for 12 weeks (36 sessions)" |
| **Tracking Method** | How progress is measured | Count (sessions completed / target) |
| **Quarter** | Q1 / Q2 / Q3 / Q4 | Q1 2026 |
| **Start Date** | First day of the quest | 2026-01-06 |
| **End Date** | Last day of the quest | 2026-03-29 |
| **Weekly Commitment** | Minimum weekly action | 3 swim sessions |

### Quest States

```
Not Started → In Progress → Done
                  ↓
              On Hold (paused, not abandoned)
                  ↓
              Abandoned (dropped with reason)
```

---

## Weekly Sprint Structure

Each quest generates one **sprint** per week. A sprint is a mini-goal that, if completed 12 times, means the quest is done.

### Sprint Definition

| Field | Description | Example |
|-------|-------------|---------|
| **Quest** | Parent quest | Swimming |
| **Week** | Week number (1-13) | Week 7 |
| **Dates** | Mon-Sun of that week | Feb 16 - Feb 22 |
| **Milestone** | What "done" looks like for this week | "Complete 3 swim sessions, try flip turns" |
| **Tasks** | Concrete daily actions | See below |
| **Status** | Not started / In progress / Done / Missed | In progress |
| **Score** | How much of the milestone was hit (0-100%) | 66% (2/3 sessions) |
| **Notes** | End-of-week reflection | "Missed Friday, shoulder was sore" |

### Sprint Planning (Weekly Reset Ritual)

Every **Sunday evening** or **Monday morning**, for each active quest:

1. Review last week's sprint: what got done, what didn't, why
2. Set this week's milestone (same as last week or adjusted)
3. Generate daily tasks and assign them to specific days
4. Check: am I on pace? (current progress / expected progress)

---

## Daily Task Generation

Each sprint produces daily tasks. Not every quest needs a task every day — some are 3x/week, some are daily.

### Task Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Title** | What to do | "Swim session: 1500m technique focus" |
| **Quest** | Parent quest | Swimming |
| **Sprint** | Parent sprint | Week 7 |
| **Day** | Scheduled day | Tuesday |
| **Duration** | Expected time | 75 min (incl. travel) |
| **Priority** | High / Medium / Low | High |
| **Status** | Todo / Done / Skipped | Todo |
| **Notes** | Post-completion notes | "Did 1200m, pool was crowded" |

### Daily View (What Surfaces)

Each morning, the daily note shows quest-linked tasks for today:

```
## Quest Tasks (Today)

### Swimming (Quest: 45% | Sprint W7: 1/3 sessions)
- [ ] Swim session: 1500m technique focus (18:00, 75 min)

### 42sh (Quest: 30% | Sprint W7: parser module)
- [ ] Implement tokenizer for shell builtins (2h block)

### JECT (Quest: 20% | Sprint W7: client proposal)
- [ ] Draft client proposal intro section (45 min)
```

Each task shows:
- Overall quest progress
- Current sprint context
- The specific action and time commitment

---

## Pacing & Alerts

### Pace Calculation

```
Expected progress = (days elapsed / total days) × 100
Actual progress = (completed units / target units) × 100
Pace = Actual / Expected
```

| Pace | Status | Action |
|------|--------|--------|
| > 1.1 | Ahead | Keep going or raise the bar |
| 0.9 - 1.1 | On track | Continue as planned |
| 0.7 - 0.9 | Behind | Increase weekly commitment or adjust scope |
| < 0.7 | At risk | Urgent: either rescue this quest or drop it honestly |

### Weekly Pace Check

During the weekly reset, each quest gets a pace check:

```
Swimming: 24/36 sessions (67%) — Day 56/84 (67%) — Pace: 1.0 ✓ On track
42sh:     3/10 milestones (30%) — Day 56/84 (67%) — Pace: 0.45 ⚠ At risk
JECT:     1/4 projects (25%)   — Day 56/84 (67%) — Pace: 0.37 ⚠ At risk
```

---

## Rituals

### Daily (5 min)

1. Check today's quest tasks in the daily note
2. At end of day: mark done/skipped, add notes
3. Quick energy/sleep check-in

### Weekly Reset (30 min, Sunday evening)

1. Score each sprint (what % of the milestone was hit)
2. Run pace check on each quest
3. Plan next week's sprints: set milestones, generate daily tasks
4. Adjust if behind: increase frequency, reduce scope, or drop
5. Archive the week

### Monthly Check-in (15 min, end of month)

1. Review all quest progress at the monthly level
2. Are any quests clearly going to fail? Decide now: push harder or drop
3. Are any quests already done? Celebrate, then set a stretch goal or pick up a new quest

### Quarterly Review (60 min, end of quarter)

1. Final score for each quest: done, partially done, abandoned
2. What worked? What didn't? Why?
3. Lessons for next quarter
4. Archive Q(n) quests, set up Q(n+1)

---

## Integration with App

In the LifeOS app, the quest cascade maps to:

- **Quest Kanban** (`/quests`) — Quarterly view, drag between columns
- **Sprint view** — Inside each quest card, see current week's milestone and tasks
- **Dashboard** — Today's quest-linked tasks surface automatically
- **Chat** — "How am I doing on swimming?" triggers pace check
- **Daily review** — Claude asks about each quest's daily tasks during evening review
- **Weekly reset** — Claude walks through sprint scoring and next-week planning

### Claude Tools for Quest System

```
getQuestProgress(questId?)     — Returns progress, pace, sprint status
scoreWeeklySprint(questId, week, score, notes)
planWeeklySprint(questId, week, milestone, tasks[])
getQuestPaceAlert()            — Returns all quests with pace < 0.9
generateWeeklyReset()          — Scores all sprints, suggests next week
```
