# LifeOS App — Design Document

**Status:** Design
**Started:** 2026-02-14
**Target:** Early April 2026 MVP (~7 weeks, AI-powered development)

---

## Vision

A personal operating system that turns your existing second brain (Obsidian vault, calendar, health data) into an **active command center**. Not another note-taking app — a dashboard that pulls live data from your real life and tells you what to focus on right now.

> "One screen in the morning, one screen at night. Everything else happens in between."

---

## Design Principles

1. **Operational, not archival** — Obsidian stays as the knowledge base. LifeOS handles what needs timelines, reminders, and live data.
2. **Loop-driven** — Built around the daily loop: capture → plan → execute → reflect.
3. **Minimum viable tracking** — Only track what changes behavior. If a metric doesn't lead to action, cut it.
4. **AI as assistant, not autopilot** — LLM surfaces suggestions and summaries. You decide.
5. **Progressive complexity** — Start with calendar + tasks + daily notes. Add modules as they earn their place.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       LIFEOS APP                          │
│                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │  Focus   │ │ Command  │ │   Life   │ │ Project  │   │
│  │  Engine  │ │  Center  │ │  Areas   │ │ Tracker  │   │
│  │ (Timer)  │ │(Dashboard│ │(Modules) │ │ (Board)  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │             │            │             │          │
│  ┌────┴─────────────┴────────────┴─────────────┴──────┐  │
│  │              Core Engine                            │  │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐ │  │
│  │  │Capture │ │ Review │ │ LLM Agent│ │  Focus    │ │  │
│  │  │ System │ │ Engine │ │(Gemini)  │ │  Shield   │ │  │
│  │  └────────┘ └────────┘ └──────────┘ └───────────┘ │  │
│  │  ┌────────────────┐ ┌──────────────────────────┐   │  │
│  │  │ Hero Journeys  │ │  Session & Streak Engine │   │  │
│  │  │ (Mastery)      │ │  (Analytics)             │   │  │
│  │  └────────────────┘ └──────────────────────────┘   │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐  │
│  │              Integration Layer                      │  │
│  │  Google Cal │ Garmin │ n8n │ Obsidian Sync          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Firebase (Firestore + Auth)            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Pillar 0: Focus Engine (Inspired by FocusHero)

The core productivity loop. Every deep work session runs through the Focus Engine.

### Focus Timer

A Pomodoro-style timer built into the app, always accessible from the top bar or a floating action button.

| Mode | Default Duration | Customizable |
|------|-----------------|--------------|
| **Focus** | 25 min | Yes (5-120 min) |
| **Short Break** | 5 min | Yes (1-30 min) |
| **Long Break** | 15 min | Yes (5-60 min) |
| **Long break after** | 4 sessions | Yes (2-8 sessions) |

**Timer features:**
- Visual countdown with progress ring
- Audio/vibration alerts on session end
- Auto-start next session (optional)
- Pause/resume with reason tracking (why did you stop?)
- Session tagging — link each focus session to an area, project, or quest
- Task binding — optionally attach a task to a session; mark it done when session ends

### Focus Blocks (Time Blocks)

Pre-scheduled focus blocks that appear on your calendar view. Like FocusHero's time blocks but integrated with Google Calendar and the task system.

```
┌──────────────────────────────────────┐
│  Focus Block: Deep Work              │
│  09:00 — 11:30 (2.5 hours)          │
│  Area: Career / JECT                 │
│  Goal: Finish client wireframes      │
│  Sessions: 5 × 25min + breaks       │
│  Buffer: 10 min before next event    │
│  Auto-start: Yes                     │
└──────────────────────────────────────┘
```

**Block features:**
- Set a goal for the block (what you want to accomplish)
- Auto-calculate number of sessions from block duration
- Buffer time before next calendar event
- Session chaining — back-to-back focus sessions within a block
- Block templates (e.g., "Morning Deep Work 2h", "Evening Study 1.5h")
- Sync to Google Calendar as an event

### Focus Shield

Distraction blocking during active focus sessions. Since LifeOS is a PWA, this works at the browser level.

- **Blocklist mode** — Block specific sites during focus (social media, news, YouTube)
- **Allowlist mode** — Only allow specific sites (docs, GitHub, school portal)
- **Visual overlay** — If you navigate to a blocked site, show a full-screen reminder with session progress and time remaining
- **Configurable per block** — Different block profiles for different types of work
- **Break access** — Blocked sites are accessible during breaks (optional)

> Implementation note: Uses a browser extension or Service Worker interception for PWA. Could leverage the Focus Mode API on supported platforms.

### Session Analytics

Every completed focus session is logged. This feeds into the analytics system.

**Tracked per session:**
- Duration (planned vs. actual)
- Area / project / quest linked
- Task worked on
- Completion status (full, partial, abandoned)
- Interruption count
- Time of day

**Aggregated views:**
- Daily focus hours (bar chart)
- Weekly focus trend (line chart)
- Focus time by area (pie/donut chart)
- Best focus times (heatmap by hour of day × day of week)
- Average session completion rate
- Focus streaks (consecutive days with ≥1 completed session)

---

## Pillar 1: Command Center (Dashboard)

The screen you open every morning and revisit every evening.

### Morning View

| Section | What it shows | Data source |
|---------|---------------|-------------|
| **Today's Schedule** | Time-blocked calendar events + focus blocks | Google Calendar API + Firestore |
| **Priority Tasks** | Top 3-5 tasks for today, ordered by energy match | Firestore tasks |
| **Focus Streak** | Current daily focus streak + today's focus goal | Firestore sessions |
| **Active Quests** | Quarterly quest progress bars (e.g., "Swimming 60%") | Firestore quests |
| **Hero Journeys** | Top 2 journeys with tier, hours this week, XP bar | Firestore journeys |
| **Energy Check-in** | Quick slider: sleep quality + energy level | User input |
| **Daily Brief** | LLM-generated summary of day ahead + suggestions | Gemini 2.5 Flash |

### Evening View

| Section | What it shows |
|---------|---------------|
| **Day Review** | What got done vs. planned |
| **Gratitude / Reflection** | Free-text journal prompt |
| **Tomorrow's Top 3** | Drag tasks from backlog to set priorities |
| **Streak Tracker** | Habit completion for today (training, journaling, etc.) |

### Quick Capture Bar

Always visible. Natural language input that the LLM parses into:
- A **task** → goes to task backlog with auto-categorized area
- An **event** → goes to calendar with conflict check
- A **note** → goes to inbox for later processing
- A **reminder** → scheduled notification

Examples:
- "Meet Thomas at 3pm Friday" → calendar event
- "Look into Garmin Connect API this weekend" → task tagged Learning
- "Cancel Amazon Prime" → task tagged Life-Admin, flagged urgent

---

## Pillar 2: Life Areas (Modules)

Each area from the PARA system gets a dedicated module. All modules share a common layout:

```
┌─────────────────────────────┐
│  Area Name          Status  │
├─────────────────────────────┤
│  Key Metrics    │  Habits   │
│  (numbers)      │  (streaks)│
├─────────────────────────────┤
│  Active Tasks               │
├─────────────────────────────┤
│  Quick Notes / Log          │
└─────────────────────────────┘
```

### Module: Health & Training

**Purpose:** Track training consistency and bodyweight skill progression.

- **Triathlon view** — Current training phase (Base / Build / Peak / Taper), weekly volume, session log
- **Bodyweight skills** — Progress tracker for handstands, pistol squats, one-arm pushups (reps/hold time over time)
- **Joint health** — Simple checklist: bird-dogs, glute bridges, planks done today?
- **Wellbeing pulse** — Sleep quality, energy, mood (from daily check-ins). Weekly trend chart
- **Garmin integration** (Phase 2) — Auto-pull workout data, heart rate, sleep from Garmin Connect API

**Key metrics displayed:**
- Training sessions this week / target
- Current bodyweight skill milestones
- Average sleep quality (7-day rolling)

### Module: Career & Learning

**Purpose:** Track professional development across EPITA, Ouidou, and JECT.

- **Skill tree** — Visual map of skills being developed (web dev, AI/LLM, cybersecurity, reverse engineering) with self-assessed levels
- **JECT tracker** — Active client projects, role, status, learnings log
- **Learning queue** — Courses, books, topics to explore (pulled from Learning.md goals)
- **Portfolio items** — Projects to showcase (RVTNails, JECT work, side projects)

**Key metrics displayed:**
- JECT projects completed
- Skills leveled up this quarter
- Learning hours this week

### Module: Finance

**Purpose:** Basic financial awareness. Not a full accounting app.

- **Monthly snapshot** — Income vs. expenses, simple category breakdown
- **Budget vs. actual** — The table from Finance.md, but live
- **Subscriptions** — Active subscriptions with renewal dates and costs
- **Goals** — Savings targets, financial literacy milestones

**Key metrics displayed:**
- Monthly spend vs. budget
- Active subscriptions total cost
- Savings rate

### Module: Personal Brand

**Purpose:** Track content creation and audience growth.

- **Content calendar** — Planned posts across Instagram, YouTube, mailing list
- **Publishing log** — What went out, when, on which platform
- **Metrics dashboard** (Phase 2) — Followers, engagement, mailing list subscribers
- **Ideas backlog** — Content ideas captured via quick capture

**Key metrics displayed:**
- Posts published this week / target
- Mailing list subscriber count
- Content ideas in backlog

### Module: Life Admin

**Purpose:** Recurring tasks and administrative overhead.

- **Recurring task engine** — Subscriptions to manage, documents to renew, bills to pay. Auto-surfaces when due
- **Admin inbox** — Urgent items (from Life-Admin.md)
- **Document tracker** — Important documents, where they're stored, expiry dates

**Key metrics displayed:**
- Overdue admin items
- Upcoming renewals (30-day lookahead)

---

## Pillar 3: Project Tracker

Active projects displayed as cards with kanban-style status.

### Project Card Layout

```
┌──────────────────────────────┐
│  Project Name                │
│  Status: Active / Planning   │
│  Area: JECT / Personal / ... │
├──────────────────────────────┤
│  Progress: ████████░░ 80%    │
│  Next action: [task]         │
│  Target: 2026-06-01          │
└──────────────────────────────┘
```

### Active Projects (from vault)

- **LLM-Calendar** — This very app, meta-tracked within itself
- **JECT** — Client projects, ops work, sales learning
- **Personal Brand** — Content creation pipeline
- **Tech Setup** — Device configs, security projects, side projects

### Project Features

- Create from template (mirrors `07-Templates/Project-Template.md`)
- Link tasks to projects
- Archive completed projects to `08-Archives`
- Weekly project review prompt (are next actions defined? is this still active?)

---

## Quests & Goals System

### Annual Goals (from Goals-2026.md)

Displayed as a year-view with quarterly milestones. Each goal links to relevant area modules and projects.

### Quarterly Quests

90-day focused challenges with:
- Clear success criteria
- Progress tracking (percentage or checklist)
- Visible on the Command Center dashboard
- End-of-quarter review prompt

### Quest Examples (current)

| Quest | Category | Tracking Method |
|-------|----------|-----------------|
| Swimming | Life / Health | Sessions per week |
| Game Jam | Life / Learning | Milestone checklist |
| Bodyweight skills | Life / Health | Reps/hold time progression |
| 42sh | Work / Learning | Milestone checklist |
| JECT mastery | Work / Career | Client projects completed |
| Personal brand setup | Work / Brand | Checklist of setup tasks |

### Hero Journeys (Inspired by FocusHero)

Long-term mastery paths that sit above quests. While quests are 90-day sprints, Hero Journeys track your multi-year progression toward mastery in a skill domain.

**Core concept:** Choose a skill path (maps to LifeOS areas). Every focus session logged in that area accumulates hours toward mastery. Visual progression from beginner to master.

#### Progression Tiers

| Tier | Title | Hours Required | Cumulative |
|------|-------|---------------|------------|
| 1 | Novice | 0 | 0 |
| 2 | Apprentice | 100 | 100 |
| 3 | Journeyman | 250 | 350 |
| 4 | Adept | 500 | 850 |
| 5 | Expert | 1,000 | 1,850 |
| 6 | Master | 3,150 | 5,000 |
| 7 | Grandmaster | 5,000 | 10,000 |

> Inspired by the 10,000-hour rule. Tiers are spaced logarithmically so early progress feels rewarding while the long game stays ambitious.

#### Journey Examples (mapped to LifeOS areas)

| Journey | Area | What counts |
|---------|------|-------------|
| Web Developer | Career | Focus sessions tagged web dev, coding, frontend, backend |
| AI / LLM Engineer | Career | Focus sessions tagged AI, machine learning, LLM |
| Triathlete | Health | Training sessions (swim, bike, run) logged via Garmin or manual |
| Writer & Creator | Personal Brand | Focus sessions tagged writing, content creation, video editing |
| Cybersecurity | Career | Focus sessions tagged security, CTF, reverse engineering |
| Entrepreneur | Career | Focus sessions tagged JECT, business, sales |

#### Journey Features

- **Progress visualization** — XP bar showing progress toward next tier
- **Hour counter** — Total hours invested, rolling 30-day average
- **Milestone celebrations** — Visual reward on tier-up (animation, badge)
- **Journey history** — Timeline of when you reached each tier
- **Multi-journey support** — Run multiple journeys in parallel (your focus sessions auto-route to the right journey based on tags)
- **Journey dashboard card** — Shows on Command Center with current tier, hours this week, and progress to next tier

#### How It Connects

- Focus sessions tagged with an area automatically feed the matching Hero Journey
- Quests can be linked to Journeys (completing a quest grants bonus hours toward the journey)
- The skill tree (Career module) visual levels align with Journey tiers
- Daily streaks count toward all active journeys

### Streaks & Habits (Enhanced)

Building on the existing habit system, add FocusHero-style streak prominence:

- **Daily focus streak** — Consecutive days with ≥1 completed focus session (displayed prominently on dashboard)
- **Area streaks** — Per-area streaks (e.g., "7-day coding streak", "14-day training streak")
- **Streak shields** — Allow 1 missed day per week without breaking the streak (configurable)
- **Streak milestones** — Visual badges at 7, 30, 60, 100, 365 days
- **Streak recovery** — If broken, show "last streak: 23 days" as motivation to beat it

---

## LLM Agent (Gemini 2.5 Flash)

### Role

The LLM acts as a **personal chief of staff**. It doesn't control your life — it processes information and surfaces what's relevant.

### Capabilities

| Capability | How it works |
|------------|--------------|
| **Natural language capture** | Parse free-text into tasks, events, notes, or reminders via function calling |
| **Daily brief generation** | Summarize today's schedule, highlight conflicts, suggest priorities based on energy and deadlines |
| **Weekly review assistant** | Generate review from completed tasks, missed goals, and upcoming deadlines |
| **Schedule optimization** | Suggest better time slots based on event type and your energy patterns |
| **Conflict detection** | Flag overlapping events and propose alternatives |
| **Quest check-in** | Periodic prompt: "You're at 40% on your swimming quest with 5 weeks left. Want to schedule more sessions?" |

### Function Calling Schema (Gemini Tools)

```
Tools:
  - createEvent(title, date, time, duration, category)
  - updateEvent(eventId, fields)
  - deleteEvent(eventId)
  - listEvents(dateRange, filters)
  - createTask(title, area, priority, dueDate)
  - updateTask(taskId, fields)
  - completeTask(taskId)
  - addNote(content, area)
  - setReminder(content, triggerDate)
  - getQuestProgress(questId)
  - getDailySummary(date)
  - getWeeklySummary(weekOf)
  - createFocusBlock(title, date, startTime, endTime, area, goal)
  - getFocusStats(dateRange, groupBy)
  - getJourneyProgress(journeyId)
  - getStreakStatus()
```

### What the LLM Does NOT Do

- Autonomously schedule or reschedule events (always proposes, you confirm)
- Access external services without explicit integration
- Make financial decisions or recommendations
- Replace your own planning and reflection

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | React + Tailwind CSS | You know it. Fast to build. Component-driven fits the module architecture |
| **Routing** | React Router or Next.js App Router | SPA feel with clean URL structure per module |
| **State** | Zustand or React Context | Lightweight. No Redux overhead for a personal app |
| **Backend** | Next.js API Routes or FastAPI | API routes if Next.js, otherwise FastAPI for Python LLM tooling |
| **Database** | Firebase Firestore | Real-time sync, offline support, no server management |
| **Auth** | Firebase Auth | Google sign-in, simple setup |
| **LLM** | Gemini 2.5 Flash | Function calling support, fast, cost-effective for personal use |
| **Calendar** | Google Calendar API | Read/write events, webhook for real-time updates |
| **Health Data** | Garmin Connect API (Phase 2) | Pull workouts, sleep, heart rate |
| **Automation** | n8n webhooks | Trigger external workflows (content pipeline, daily digests) |
| **Hosting** | Vercel or Firebase Hosting | Free tier sufficient for personal use |

---

## Data Model (Firestore)

```
users/{userId}/
  ├── profile/
  │     └── settings, preferences, energy patterns
  │     └── focusSettings: { defaultFocus, defaultBreak, defaultLongBreak,
  │           longBreakAfter, autoStartNext, blocklist[], allowlist[] }
  │
  ├── tasks/{taskId}
  │     └── title, area, project, priority, status, dueDate, createdAt
  │
  ├── events/{eventId}
  │     └── title, start, end, category, source (manual/gcal), notes
  │
  ├── notes/{noteId}
  │     └── content, area, tags, createdAt, processed (bool)
  │
  ├── quests/{questId}
  │     └── title, category, criteria, progress, startDate, endDate
  │
  ├── goals/{goalId}
  │     └── title, year, quarter, status, linkedQuests[], linkedProjects[]
  │
  ├── projects/{projectId}
  │     └── title, area, status, target, nextAction, linkedTasks[]
  │
  ├── habits/{habitId}
  │     └── name, frequency, streak, history[]
  │
  ├── dailyLogs/{date}
  │     └── sleepQuality, energy, mood, gratitude, reflection, tasks[],
  │           focusSessions (count), focusMinutes (total), streakDay (int)
  │
  ├── focusSessions/{sessionId}                          ← NEW
  │     └── startedAt, endedAt, plannedDuration, actualDuration,
  │           type (focus/break/longBreak), status (completed/partial/abandoned),
  │           area, project, quest, taskId, interruptions (count),
  │           blockId (if part of a focus block), journeyId
  │
  ├── focusBlocks/{blockId}                              ← NEW
  │     └── title, date, startTime, endTime, area, project,
  │           goal (text), sessionCount, sessionDuration, breakDuration,
  │           bufferMinutes, autoStart (bool), template (string),
  │           sessions[] (linked sessionIds), status (scheduled/active/done)
  │
  ├── journeys/{journeyId}                               ← NEW
  │     └── title, area, description, totalHours, currentTier,
  │           tierHistory[] ({ tier, reachedAt }),
  │           tags[] (which session tags count toward this journey),
  │           createdAt, isActive (bool)
  │
  ├── streaks/                                           ← NEW
  │     └── focus: { current, longest, lastActiveDate }
  │     └── areas/{areaId}: { current, longest, lastActiveDate }
  │     └── shieldDaysUsed (int, resets weekly)
  │
  ├── finance/
  │     ├── transactions/{txId}
  │     │     └── amount, category, date, note
  │     └── subscriptions/{subId}
  │           └── name, cost, frequency, renewalDate
  │
  └── areas/{areaId}
        └── name, description, metrics{}, linkedProjects[], linkedTasks[]
```

---

## Implementation Phases

> **Development approach:** AI-powered development (Claude Code, Cursor, etc.). This compresses scaffolding, CRUD, UI components, and data model work from hours to minutes. The bottleneck shifts from "writing code" to **decision-making, integration debugging, and UX iteration**. Phases are restructured accordingly — what would take 19 weeks solo ships in ~8 weeks of focused sessions.
>
> **What AI accelerates:** Boilerplate, CRUD, component generation, data model setup, styling, test scaffolding, repetitive module builds, LLM prompt engineering.
>
> **What still takes human time:** OAuth/API credential setup, third-party integration debugging, UX decisions, design iteration, manual testing of real-time flows, deploy configuration, browser extension edge cases.

### Phase 0: Foundation (Days 1-2)

AI generates the entire scaffold in a single session. You make config decisions.

- [ ] Init Next.js + Tailwind project (AI generates full boilerplate)
- [ ] Firebase project setup — create project, enable Firestore + Auth (manual console work)
- [ ] Auth flow (Google sign-in) — AI writes the code, you configure Firebase console
- [ ] App shell with sidebar navigation (Dashboard, Focus, Areas, Projects, Quests, Journeys, Calendar, Settings)
- [ ] Full Firestore data model — AI generates all collections, types, and helper functions from the spec above
- [ ] Deploy to Vercel (manual: link repo, set env vars)

**AI leverage:** ~90%. The scaffold, routing, types, auth wrapper, layout components, and Firestore helpers are all generated in one pass.

### Phase 1: Core Loop + Focus Engine (Days 3-7)

The productivity core. AI builds the CRUD and UI fast; you iterate on UX feel.

- [ ] **Task system** — Full CRUD with area/project tagging, priority, status, due dates, filters
- [ ] **Daily log** — Morning check-in (sleep, energy) + evening reflection + gratitude
- [ ] **Quick capture bar** — Text input that creates tasks/notes (basic parsing, LLM upgrade later)
- [ ] **Focus timer** — Pomodoro timer with configurable durations, progress ring, audio alerts, pause/resume
- [ ] **Session logging** — Save completed sessions to Firestore with area/project/quest/task links
- [ ] **Focus streak engine** — Consecutive-day tracking, streak display on dashboard
- [ ] **Dashboard — Morning view** — Static layout with today's tasks, schedule, focus streak, energy check-in
- [ ] **Dashboard — Evening view** — Day review, reflection prompt, tomorrow's top 3

**AI leverage:** ~85%. CRUD and timer logic are ideal for AI generation. The timer UX (animations, feel of the countdown) needs human iteration.

### Phase 2: Life Areas + Focus Blocks + Projects (Days 8-13)

Five area modules share a layout — AI generates the first, you refine, then AI replicates across all five. Projects and focus blocks are mostly CRUD.

- [ ] Shared area module layout component (metrics + habits + tasks + notes)
- [ ] **Health module** — Training log, bodyweight skill tracker, joint health checklist, wellbeing pulse
- [ ] **Career module** — Skill tree, JECT project tracker, learning queue, portfolio items
- [ ] **Finance module** — Monthly snapshot, budget vs. actual, subscription tracker, goals
- [ ] **Personal Brand module** — Content calendar, publishing log, ideas backlog
- [ ] **Life Admin module** — Recurring tasks, admin inbox, document tracker with expiry dates
- [ ] **Project tracker** — Kanban board with project cards, CRUD, link tasks, archive, weekly review prompt
- [ ] **Focus blocks** — Schedule blocks with goals, session chaining, buffer time, block templates
- [ ] **Calendar view** — Weekly calendar rendering events + focus blocks from Firestore

**AI leverage:** ~90%. Repetitive module work is where AI shines hardest. Generate one module, review, then batch-generate the rest with consistent patterns.

### Phase 3: Task System Upgrade + Todoist Parity (Days 14-19)

The task system is functional but basic. These upgrades make it a real daily driver — no external dependencies, pure frontend + Firestore work.

**Sprint A — Core Task Upgrades (Days 14-16):**
- [ ] **Sub-tasks** — Add `parentId` to Task type, nest child tasks under parents, collapse/expand toggle
- [ ] **Task descriptions** — Add `description` field (markdown), expandable area below task title
- [ ] **Natural language date parsing** — `chrono-node` library to parse "tomorrow", "next Friday" from quick capture
- [ ] **Today view** — New `/today` route: due today + in_progress + overdue, grouped by urgency

**Sprint B — Views & Organization (Days 17-19):**
- [ ] **Sort & group options** — Sort by date/priority/name, group by area/priority/date/project
- [ ] **Drag-and-drop reordering** — `sortOrder` field + `@dnd-kit/sortable` for manual ordering
- [ ] **Upcoming view** — New `/upcoming` route: tasks grouped by day for next 7/14/30 days
- [ ] **Completed tasks archive** — `/tasks/completed` route with date/area filters, restore-to-todo

**AI leverage:** ~90%. All CRUD extensions and new views are ideal for AI generation. chrono-node integration is well-documented.

### Phase 4: Project Depth & Advanced Task Features (Days 20-24)

Project structure upgrades and advanced task management.

- [ ] **Sections within projects** — Named sections to group tasks inside a project
- [ ] **Task duration estimates** — `estimatedMinutes` field, badge display, sum in Today view header
- [ ] **Custom filters** — Boolean query builder (area AND priority AND date range), save as filter presets
- [ ] **Bulk task operations** — Multi-select tasks to move, reschedule, or change priority

**AI leverage:** ~85%. Filter logic and CRUD extensions are straightforward for AI.

### Phase 5: LLM Integration + Smart Features (Days 25-30)

LLM-powered features that turn LifeOS from a tracker into an assistant. Requires Gemini API setup.

- [ ] **Gemini 2.5 Flash setup** — API key, function calling schema, rate limit handling
- [ ] **Smart quick capture** — LLM parses text → task/event/note/reminder with auto-categorization
- [ ] **AI task breakdown** — "Break this down" button → LLM suggests sub-tasks for a parent task
- [ ] **Daily brief generation** — Morning summary: schedule + focus stats + priority suggestions
- [ ] **Filter Assist** — Natural language → filter query ("show overdue career tasks")
- [ ] **Priority suggestions** — LLM ranks unscheduled tasks based on due dates, area balance, energy patterns
- [ ] **Prompt tuning** — Iterate on real-world input patterns, edge cases, hallucination guards

**AI leverage:** ~60%. Integration code is fast to write but prompt engineering, function calling reliability, and edge-case handling need hands-on iteration.

### Phase 6: Analytics, Polish & Hardening (Days 31-36)

Production readiness. Charts, notifications, performance, security.

**Analytics:**
- [ ] **Task completion charts** — Daily/weekly/monthly charts (tasks done, by area)
- [ ] **Focus session stats** — Hours, completion rates, by area
- [ ] **Activity history feed** — Timeline of actions across all collections
- [ ] **Wellbeing trends** — Energy/sleep/mood charts over time

**Integrations:**
- [ ] **Two-way Google Calendar sync** — Webhook or polling for changes back from GCal
- [ ] **n8n webhook endpoints** — Trigger external workflows (content pipeline, digests)

**Hardening:**
- [ ] **Notification system** — Browser push for reminders, due tasks
- [ ] **Offline support** — Firestore offline persistence, sync-on-reconnect
- [ ] **Error handling pass** — Loading states, empty states, network failures, graceful degradation
- [ ] **Security review** — Firestore rules audit, API key scoping, auth edge cases
- [ ] **Performance pass** — Lazy loading, code splitting, query optimization
- [ ] **Mobile polish** — Final responsive pass, touch targets, PWA install prompt

**AI leverage:** ~65%. Charts and error handling are fast to generate. Notification permissions, offline sync edge cases, and security review need manual verification.

---

### Timeline Summary (AI-Powered, Updated)

| Phase | Status | Duration | Calendar | AI Leverage |
|-------|--------|----------|----------|-------------|
| 0 — Foundation | **Done** | 2 days | Days 1-2 | ~90% |
| 1 — Core Loop + Focus Engine | **Done** | 5 days | Days 3-7 | ~85% |
| 2 — Areas + Projects | **Done** | 6 days | Days 8-13 | ~90% |
| 3 — Task Upgrades + Todoist Parity | **Next** | 6 days | Days 14-19 | ~90% |
| 4 — Project Depth & Advanced Tasks | Planned | 5 days | Days 20-24 | ~85% |
| 5 — LLM Integration + Smart Features | Planned | 6 days | Days 25-30 | ~60% |
| 6 — Analytics, Polish & Hardening | Planned | 6 days | Days 31-36 | ~65% |
| **Total** | | **~36 working days** | **~7 weeks** | **~80% avg** |

> **Key changes:** Removed gamification features (journeys, quests, streaks, focus blocks, water tracker, weekly review) to focus on core task management. Phase 3 now focuses on task system depth (sub-tasks, descriptions, NL dates, today/upcoming views) before LLM features. Leaner scope = faster to daily-driver quality.

---

## Screen Map

```
/                     → Dashboard (Command Center)
/focus                → Focus timer (full-screen focus mode)
/focus/blocks         → Focus block planner (schedule blocks)
/focus/analytics      → Focus session analytics & charts
/capture              → Full capture interface
/areas                → Area overview grid
/areas/health         → Health & Training module
/areas/career         → Career & Learning module
/areas/finance        → Finance module
/areas/brand          → Personal Brand module
/areas/admin          → Life Admin module
/projects             → Project board (all projects)
/projects/:id         → Single project detail
/quests               → Quest tracker
/journeys             → Hero Journey dashboard (all journeys)
/journeys/:id         → Single journey detail + history
/goals                → Annual goals + quarterly breakdown
/calendar             → Full calendar view (with focus blocks overlay)
/review               → Weekly/monthly review (includes focus stats)
/settings             → Profile, integrations, preferences
/settings/focus       → Focus timer defaults, Focus Shield config
```

---

## What This Replaces vs. What Stays

| Tool | Verdict | Reason |
|------|---------|--------|
| **Obsidian vault** | **Stays** | Long-form notes, knowledge base, reference material. LifeOS is not a note-taking app |
| **Google Calendar** | **Integrates** | LifeOS reads/writes to it. Google Calendar remains the source of truth for scheduling |
| **Garmin** | **Integrates** | LifeOS pulls data. Garmin stays for workout tracking |
| **Scattered task lists** | **Replaced** | All tasks live in LifeOS |
| **Manual daily notes** | **Replaced** | Daily log built into the app with structured prompts |
| **Spreadsheet budgeting** | **Replaced** | Finance module handles basic tracking |
| **Mental tracking of quests** | **Replaced** | Visual quest progress in the app |

---

## Open Questions

- [ ] **PWA or native?** — PWA is fastest to ship and works offline. Native (React Native/Expo) gives better mobile UX but doubles the work. Recommend: start PWA, go native later if needed.
- [ ] **Obsidian sync?** — Should LifeOS sync back to the Obsidian vault (e.g., auto-generate daily notes as .md files)? Could use the GitHub sync plugin as a bridge.
- [ ] **Multi-device strategy** — Firebase handles real-time sync natively. PWA + Firestore gives you phone/laptop/tablet with no extra work.
- [ ] **Voice input priority** — The LLM-Calendar spec mentions voice commands. Worth building early (Web Speech API is simple) or deferring to Phase 6?

---

## Success Criteria for MVP

The app is useful when you can:

1. Open it in the morning and see your day (schedule + tasks + energy check-in + focus streak)
2. Quick-capture a thought and have it land in the right place
3. Start a focus session, link it to a task, and see it count toward your Hero Journey
4. See your quarterly quest progress without checking markdown files
5. Do an evening reflection with structured prompts (including focus stats for the day)
6. Review your week in under 5 minutes with an LLM-generated summary (including focus hours)
7. See your long-term mastery progress across skill domains (Hero Journeys)
