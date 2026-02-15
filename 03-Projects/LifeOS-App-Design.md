# LifeOS App — Design Document

**Status:** Design (Finalized)
**Started:** 2026-02-14
**Target:** Q2 2026 MVP

---

## Vision

A personal operating system that turns your existing second brain (Obsidian vault, calendar, health data) into an **active command center**. Not another note-taking app — a dashboard that pulls live data from your real life and tells you what to focus on right now.

The primary interaction model is **conversational**: a full-screen chat with an agentic Claude instance that can read your schedule, create tasks, generate reviews, and take multi-step actions on your behalf — always with confirmation before execution.

> "Talk to your life. It talks back."

---

## Design Principles

1. **Operational, not archival** — Obsidian stays as the knowledge base. LifeOS handles what needs timelines, reminders, and live data.
2. **Loop-driven** — Built around the daily loop: capture → plan → execute → reflect.
3. **Conversation-first** — The chat interface is the primary way to interact. Dashboard and modules are read-optimized views.
4. **AI as chief of staff** — Claude chains multi-step actions (check calendar → find conflict → propose alternative → create event) but always confirms before executing.
5. **Two-way vault sync** — LifeOS and Obsidian stay in sync via GitHub. Changes in either place propagate to the other.
6. **Minimum viable tracking** — Only track what changes behavior. If a metric doesn't lead to action, cut it.
7. **Progressive complexity** — Start with dashboard + chat + tasks. Add modules as they earn their place.

---

## Decisions Log

All architectural and feature decisions, finalized 2026-02-14.

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| **Platform** | PWA | React Native, Tauri Desktop |
| **Framework** | Next.js (App Router) | Vite + React, SvelteKit, Nuxt |
| **Backend** | Next.js API Routes | FastAPI, Firebase Cloud Functions, Hono |
| **Database** | Firebase Firestore | Supabase, PlanetScale, SQLite local-first |
| **Auth** | NextAuth.js (Auth.js) | Firebase Auth, Clerk, No auth |
| **Hosting** | Vercel | Self-hosted VPS, Firebase Hosting, Coolify |
| **UI** | Tailwind CSS + shadcn/ui | DaisyUI, Chakra UI, Tailwind only |
| **LLM** | Claude (Anthropic API) | Gemini 2.5 Flash, GPT-4o-mini, Local Ollama |
| **AI Pattern** | Agentic multi-step with tool use | Single action, Streaming preview |
| **State Management** | React Context + useReducer | Zustand, TanStack Query, tRPC |
| **DB Client** | Firebase SDK v9+ | ReactFire, TanStack Query wrapper, Typesaurus |
| **Calendar** | Google Calendar API | Cal.com, Apple Calendar |
| **Health Data** | Garmin Connect API | Manual logging, Apple Health, Strava |
| **Capture UX** | Full-screen chat interface | Command bar, Bottom bar, Combined |
| **Daily Review** | AI-guided conversation | Structured form, Free-form journal, Hybrid |
| **Dashboard Focus** | Today's schedule + tasks, AI daily brief | Quest progress, Wellbeing metrics |
| **MVP Modules** | Health & Training, Career & Learning | Finance, Personal Brand (deferred) |
| **Training Detail** | Garmin-driven + full training plan | Session logging, Periodization-aware only |
| **Obsidian Sync** | Two-way via GitHub as bridge | Separate, One-way read, Obsidian plugin |
| **Quest UI** | Kanban columns | Progress bars, Skill tree, Streak calendar |
| **Notifications** | Browser push notifications | In-app only, Email digest, Telegram bot |
| **Design Style** | Minimal dark | Notion-like, Terminal aesthetic, Glassmorphism |
| **Voice Input** | Not in MVP | Web Speech API, Whisper, Voice-first |
| **Language** | English UI, chat in any language | Full i18n, French only |
| **Automation (n8n)** | Deferred to later phase | Webhooks from start, Vercel Cron |

---

## Tech Stack

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND                                           │
│  Next.js 15 (App Router) + React 19                 │
│  Tailwind CSS + shadcn/ui                           │
│  React Context + useReducer (state)                 │
│  PWA (next-pwa / Serwist)                           │
├─────────────────────────────────────────────────────┤
│  BACKEND                                            │
│  Next.js API Routes (Route Handlers)                │
│  NextAuth.js v5 (Auth.js) — Google OAuth            │
│  Anthropic SDK — Claude tool use (agentic)          │
├─────────────────────────────────────────────────────┤
│  DATA                                               │
│  Firebase Firestore (primary database)              │
│  Firebase SDK v9+ (client-side)                     │
│  Firebase Admin SDK (server-side API routes)        │
├─────────────────────────────────────────────────────┤
│  INTEGRATIONS                                       │
│  Google Calendar API (OAuth2, read/write)            │
│  Garmin Connect API (workouts, sleep, HR)            │
│  GitHub API (Obsidian vault two-way sync)            │
├─────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                     │
│  Vercel (hosting + edge functions + cron)            │
│  GitHub (source code + Obsidian vault bridge)        │
│  Browser Push API (notifications)                   │
└─────────────────────────────────────────────────────┘
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       LIFEOS APP                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Command    │  │  Chat View   │  │   Life Area  │   │
│  │   Center     │  │  (Claude AI) │  │   Modules    │   │
│  │  (Dashboard) │  │  Full-screen │  │  Health,     │   │
│  │              │  │  Agentic     │  │  Career      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │            │
│  ┌──────┴─────────────────┴──────────────────┴───────┐   │
│  │              Core Engine                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │   │
│  │  │  Task    │ │  Review  │ │   Claude Agent    │  │   │
│  │  │  System  │ │  Engine  │ │   (Anthropic API) │  │   │
│  │  │          │ │          │ │   Multi-step      │  │   │
│  │  │          │ │          │ │   Tool Use        │  │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │   │
│  └────────────────────────┬──────────────────────────┘   │
│                           │                              │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │            Integration Layer                       │   │
│  │  Google Calendar │ Garmin Connect │ GitHub (Vault) │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │          Firebase Firestore + NextAuth.js          │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Pillar 1: Command Center (Dashboard)

Route: `/`

The screen you open every morning. Minimal dark design. Information-dense but clean.

### Layout

```
┌──────────────────────────────────────────────────┐
│  LifeOS                    [Chat] [Areas] [⚙]    │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐ │
│  │  TODAY'S SCHEDULE    │  │  AI DAILY BRIEF    │ │
│  │                      │  │                    │ │
│  │  09:00 EPITA Lecture │  │  "You have 3       │ │
│  │  12:00 Lunch         │  │   meetings today.  │ │
│  │  14:00 JECT Meeting  │  │   Your swimming    │ │
│  │  16:00 Free          │  │   quest is at 45%  │ │
│  │  18:00 Swim Training │  │   with 6 weeks     │ │
│  │                      │  │   left. Consider   │ │
│  │                      │  │   adding a Friday  │ │
│  │                      │  │   session."        │ │
│  └─────────────────────┘  └────────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │  PRIORITY TASKS                               │ │
│  │  ☐ Review JECT client proposal     [Career]   │ │
│  │  ☐ Fix GrapheneOS notifications    [Admin]    │ │
│  │  ☐ Push LifeOS design doc          [Project]  │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │  ACTIVE QUESTS (Kanban)                       │ │
│  │  Not Started │ In Progress    │ Done          │ │
│  │  ───────────┼────────────────┼──────────     │ │
│  │  Game Jam    │ Swimming (45%) │ ...           │ │
│  │             │ 42sh (30%)     │               │ │
│  │             │ JECT (20%)     │               │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Dashboard Sections

| Section | What it shows | Data source |
|---------|---------------|-------------|
| **Today's Schedule** | Time-blocked calendar events for today | Google Calendar API |
| **AI Daily Brief** | Claude-generated summary of the day ahead: schedule highlights, quest nudges, flagged deadlines | Claude API (generated on first load or via Vercel Cron) |
| **Priority Tasks** | Top 3-5 tasks for today, tagged by area | Firestore tasks collection |
| **Active Quests** | Kanban columns: Not Started / In Progress / Done | Firestore quests collection |

### Daily Brief Generation

Triggered automatically each morning (via Vercel Cron at 07:00) or on first dashboard load:

1. Fetch today's Google Calendar events
2. Fetch overdue and due-today tasks
3. Fetch quest progress percentages
4. Send context to Claude with system prompt: "Generate a concise daily brief for the user"
5. Cache the result in Firestore (`dailyBriefs/{date}`)

---

## Pillar 2: Chat Interface (Claude AI)

Route: `/chat`

The primary interaction surface. Full-screen conversational interface with an agentic Claude instance.

### Layout

```
┌──────────────────────────────────────────────────┐
│  LifeOS Chat              [Dashboard] [Areas] [⚙]│
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │                                              │ │
│  │  Claude: Good morning! Here's your day:      │ │
│  │  - 3 meetings (EPITA, JECT, study group)     │ │
│  │  - 2 overdue tasks from yesterday            │ │
│  │  - Swimming quest: 45% (on track)            │ │
│  │                                              │ │
│  │  What would you like to focus on?            │ │
│  │                                              │ │
│  │  You: Schedule a swim session for Friday     │ │
│  │  at 6pm                                      │ │
│  │                                              │ │
│  │  Claude: I'll create that event.             │ │
│  │  ┌────────────────────────────────┐          │ │
│  │  │ 📅 Create Event                │          │ │
│  │  │ Swim Training                  │          │ │
│  │  │ Friday Feb 20, 18:00 - 19:30  │          │ │
│  │  │ Category: Health / Triathlon   │          │ │
│  │  │                                │          │ │
│  │  │ [Confirm]  [Edit]  [Cancel]    │          │ │
│  │  └────────────────────────────────┘          │ │
│  │                                              │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │  Type a message...                     [Send] │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Claude Agent Configuration

**Model:** Claude (latest Sonnet or Haiku for speed, Opus for complex planning)

**System prompt context (injected per conversation):**
- Today's date and time
- Today's calendar events
- Active tasks (top 10 by priority)
- Active quests with progress
- Current training phase and recent workouts
- User preferences and energy patterns

**Tool definitions for Claude:**

```typescript
const tools = [
  // Calendar
  { name: "createEvent", params: { title, date, startTime, endTime, category } },
  { name: "updateEvent", params: { eventId, fields } },
  { name: "deleteEvent", params: { eventId } },
  { name: "listEvents", params: { startDate, endDate, category? } },
  { name: "findFreeSlots", params: { date, duration, preferredTimeRange? } },

  // Tasks
  { name: "createTask", params: { title, area, priority, dueDate?, project? } },
  { name: "updateTask", params: { taskId, fields } },
  { name: "completeTask", params: { taskId } },
  { name: "listTasks", params: { area?, status?, dueDate? } },

  // Notes & Capture
  { name: "addNote", params: { content, area?, tags? } },
  { name: "setReminder", params: { content, triggerDate } },

  // Quests & Goals
  { name: "getQuestProgress", params: { questId? } },
  { name: "updateQuestProgress", params: { questId, progress, note? } },

  // Reviews
  { name: "generateDailyBrief", params: { date } },
  { name: "generateWeeklyReview", params: { weekOf } },

  // Training
  { name: "getRecentWorkouts", params: { days, type? } },
  { name: "getTrainingPlan", params: { week? } },
  { name: "logWorkout", params: { type, duration, distance?, notes? } },

  // Vault
  { name: "syncToVault", params: { type, content } },
  { name: "readFromVault", params: { path } },
]
```

### Agentic Flow Example

User: "I need to prepare for the JECT client meeting next Thursday"

Claude chains:
1. `listEvents({ startDate: "next Thursday" })` — checks schedule
2. `listTasks({ area: "career", project: "JECT" })` — finds related tasks
3. `readFromVault({ path: "03-Projects/JECT.md" })` — reads project context
4. Generates response with: meeting details, related open tasks, preparation suggestions
5. `createTask({ title: "Prepare JECT client presentation", area: "career", dueDate: "Wed", project: "JECT" })` — proposes a prep task
6. User confirms → task created

### AI-Guided Daily Review

Triggered from chat. Claude walks through:

1. "How did you sleep? How's your energy?" → logs to `dailyLogs/{date}`
2. "Here's what you planned vs. what you did today:" → shows completed/missed tasks
3. "Anything you're grateful for today?" → logs reflection
4. "Let's set your top 3 for tomorrow:" → creates/prioritizes tasks
5. "Your swimming quest is at 45%. Want to plan sessions for this week?" → proactive coaching

The conversation is stored as a `dailyLogs/{date}.review` document for future reference.

---

## Pillar 3: Life Area Modules

Route: `/areas`, `/areas/:slug`

### MVP Modules (Phase 1)

Only **Health & Training** and **Career & Learning** ship in MVP. Finance, Personal Brand, and Life Admin are deferred.

### Shared Module Layout

Every area module uses the same component structure:

```
┌──────────────────────────────────────────────────┐
│  Area Name                           [Chat about] │
├──────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  KEY METRICS  │  │  HABITS / STREAKS        │  │
│  │  3 numbers    │  │  checkboxes + streaks    │  │
│  └──────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  AREA-SPECIFIC CONTENT                            │
│  (training plan, skill tree, etc.)                │
├──────────────────────────────────────────────────┤
│  ACTIVE TASKS (filtered to this area)             │
├──────────────────────────────────────────────────┤
│  RECENT NOTES / LOG                               │
└──────────────────────────────────────────────────┘
```

The `[Chat about]` button opens `/chat` pre-loaded with area context so you can ask Claude area-specific questions.

---

### Module: Health & Training

Route: `/areas/health`

#### Training Plan View

```
┌──────────────────────────────────────────────────┐
│  Health & Training                  [Chat about]  │
├──────────────────────────────────────────────────┤
│  Sessions: 4/5  │  Phase: Build  │  Sleep: 7.2   │
├──────────────────────────────────────────────────┤
│                                                   │
│  THIS WEEK'S PLAN                                 │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬───┐ │
│  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │Sun│ │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼───┤ │
│  │ Run  │ Swim │ Rest │ Bike │ Swim │ Long │Off│ │
│  │ 45m  │ 60m  │      │ 90m  │ 60m  │ Run  │   │ │
│  │ Z2   │ Tech │      │ Z2   │ Tech │ 120m │   │ │
│  │  ✓   │  ✓   │  ✓   │  ✓   │      │      │   │ │
│  └──────┴──────┴──────┴──────┴──────┴──────┴───┘ │
│                                                   │
│  TRAINING PHASES          Current: Build (Wk 3/6) │
│  [Base ✓] → [BUILD] → [Peak] → [Taper] → [Race] │
│                                                   │
│  BODYWEIGHT SKILLS                                │
│  Handstand hold:    15s → target 60s  ████░░░░    │
│  Pistol squats:     3 reps → target 10 ███░░░░    │
│  One-arm pushups:   1 rep → target 5   ██░░░░░    │
│                                                   │
│  JOINT HEALTH (today)                             │
│  ☑ Bird-dogs  ☐ Glute bridges  ☑ Planks          │
│                                                   │
│  RECENT GARMIN DATA                               │
│  Resting HR: 52 │ HRV: 65 │ Sleep: 7h12m         │
│  Last workout: Swim 1500m, 38:22 (yesterday)      │
│                                                   │
└──────────────────────────────────────────────────┘
```

#### Features

- **Training plan engine** — Define weekly training structure per phase (Base/Build/Peak/Taper). Each day has a prescribed workout type, duration, zone, and notes
- **Garmin auto-import** — Pull completed workouts from Garmin Connect API. Match to planned sessions. Show completion status
- **Periodization tracker** — Visual phase progression. Current week within current phase. Phase duration configurable
- **Bodyweight skill progression** — Track reps/hold time per skill. Chart progress over time
- **Joint health checklist** — Daily yes/no for each exercise. Streak counter
- **Wellbeing pulse** — Sleep quality, energy, mood from daily check-ins. 7-day rolling averages displayed as key metrics

#### Garmin Connect Integration

- **OAuth2 flow** via Garmin Connect API
- **Data pulled:** Activities (swim/bike/run with distance, duration, HR zones), daily summaries (resting HR, HRV, sleep duration/score, steps, stress)
- **Sync frequency:** On-demand pull via API route + optional Vercel Cron (every 6 hours)
- **Matching logic:** Auto-match Garmin activities to planned training sessions by date + activity type

---

### Module: Career & Learning

Route: `/areas/career`

#### Layout

```
┌──────────────────────────────────────────────────┐
│  Career & Learning                  [Chat about]  │
├──────────────────────────────────────────────────┤
│  JECT Projects: 1  │  Skills: 6  │  Hours: 12    │
├──────────────────────────────────────────────────┤
│                                                   │
│  SKILL MAP                                        │
│  Web Dev        ████████░░  Advanced              │
│  AI / LLMs      ██████░░░░  Intermediate          │
│  Cybersecurity  ███░░░░░░░  Beginner              │
│  Rev. Eng.      ██░░░░░░░░  Beginner              │
│  DevOps / CI    █████░░░░░  Intermediate          │
│  Backend        ███████░░░  Advanced              │
│                                                   │
│  JECT PROJECTS                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ Client: [name]                              │   │
│  │ Role: Dev + Ops                             │   │
│  │ Status: In Progress                         │   │
│  │ Next: Deliver wireframes by Feb 21          │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  LEARNING QUEUE                                   │
│  1. GrapheneOS deep dive                          │
│  2. Finance / financial literacy                  │
│  3. Cybersecurity (reverse engineering, audits)    │
│  4. AI systems setup                              │
│                                                   │
│  PORTFOLIO                                        │
│  • RVTNails (add to portfolio)                    │
│  • JECT client work                               │
│  • LifeOS app                                     │
│                                                   │
└──────────────────────────────────────────────────┘
```

#### Features

- **Skill map** — Self-assessed skill levels with progress bars. Update levels manually or via Claude during reviews
- **JECT project cards** — Track active JECT client work: client name, role, status, next action, learnings
- **Learning queue** — Ordered list of topics to learn (from Learning.md). Can reorder, add, archive
- **Portfolio tracker** — Projects to showcase. Status (draft/published), links

---

## Pillar 4: Project Tracker

Route: `/projects`, `/projects/:id`

### Kanban Board

```
┌──────────────────────────────────────────────────┐
│  Projects                           [+ New]       │
├──────────────────────────────────────────────────┤
│  Planning       │  Active          │  Done        │
│  ─────────────  │  ──────────────  │  ──────────  │
│  ┌───────────┐  │  ┌────────────┐  │              │
│  │ Personal  │  │  │ JECT       │  │              │
│  │ Brand     │  │  │ Career     │  │              │
│  │           │  │  │ 3 tasks    │  │              │
│  │ Q2 target │  │  │ Due: Mar   │  │              │
│  └───────────┘  │  └────────────┘  │              │
│                 │  ┌────────────┐  │              │
│                 │  │ LifeOS App │  │              │
│                 │  │ Personal   │  │              │
│                 │  │ 8 tasks    │  │              │
│                 │  │ Due: Q2    │  │              │
│                 │  └────────────┘  │              │
│                 │  ┌────────────┐  │              │
│                 │  │ Tech Setup │  │              │
│                 │  │ Personal   │  │              │
│                 │  │ 5 tasks    │  │              │
│                 │  └────────────┘  │              │
└──────────────────────────────────────────────────┘
```

### Project Detail View

- Project name, status, area, target date
- Linked tasks (filterable, completable inline)
- Next action (highlighted at top)
- Notes and decision log
- Archive button (moves to done + syncs to vault `08-Archives`)

### Project Features

- Create from template (mirrors `07-Templates/Project-Template.md`)
- Drag between columns to change status
- Link tasks to projects (tasks show project tag)
- Weekly review prompt: "These projects have no next action defined. Update them?"

---

## Pillar 5: Quest Cascade System

Route: `/quests`, `/quests/:id`, `/goals`

The quest system uses a **cascade**: Annual Goals → Quarterly Quests → Weekly Sprints → Daily Tasks. Each level feeds the one below it. See `04-Goals/Quest-System.md` for full methodology.

### Quest Kanban (`/quests`)

```
┌──────────────────────────────────────────────────────┐
│  Q1 2026 Quests                         [+ New]       │
├──────────────────────────────────────────────────────┤
│  Not Started    │  In Progress        │  Done         │
│  ─────────────  │  ────────────────── │  ──────────── │
│  ┌───────────┐  │  ┌────────────────┐ │               │
│  │ Game Jam  │  │  │ Swimming       │ │               │
│  │ Life      │  │  │ Life/Health    │ │               │
│  │           │  │  │ 24/36 (67%)   │ │               │
│  └───────────┘  │  │ Pace: 1.0 ✓   │ │               │
│                 │  │ W7: 1200m cont │ │               │
│                 │  └────────────────┘ │               │
│                 │  ┌────────────────┐ │               │
│                 │  │ 42sh           │ │               │
│                 │  │ Work/Learning  │ │               │
│                 │  │ 3/10 (30%)    │ │               │
│                 │  │ Pace: 0.45 ⚠  │ │               │
│                 │  │ W7: env vars   │ │               │
│                 │  └────────────────┘ │               │
└──────────────────────────────────────────────────────┘
```

Each quest card now shows: progress fraction, pace indicator, and current sprint milestone.

### Quest Detail (`/quests/:id`)

```
┌──────────────────────────────────────────────────────┐
│  ← Quests          Swimming              [Chat about] │
├──────────────────────────────────────────────────────┤
│  Progress: 24/36 sessions (67%)                       │
│  ████████████████████░░░░░░░░░░                       │
│  Pace: 1.0 — On track                                │
│  Parent goal: Triathlon training consistency           │
├──────────────────────────────────────────────────────┤
│                                                       │
│  CURRENT SPRINT: Week 7 (Feb 17-23)                   │
│  Milestone: 3 sessions, 1200m continuous               │
│                                                       │
│  ☑ Tue: Swim 1200m technique focus (60 min)           │
│  ☐ Thu: Swim 1000m intervals 4x250 (60 min)          │
│  ☐ Sat: Swim 1500m continuous endurance (75 min)      │
│                                                       │
│  SPRINT HISTORY                                       │
│  W6: 3/3 sessions, flip turns in warmup      100% ✓  │
│  W5: 2/3 sessions, flip turn practice         66% △  │
│  W4: 3/3 sessions, 1000m continuous          100% ✓  │
│  W3: 3/3 sessions, bilateral breathing       100% ✓  │
│  W2: 2/3 sessions, breathing rhythm           66% △  │
│  W1: 3/3 sessions, established routine       100% ✓  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Quest Detail Features

- **Progress bar** with pace calculation (actual / expected)
- **Pace alerts**: Ahead (>1.1), On track (0.9-1.1), Behind (0.7-0.9), At risk (<0.7)
- **Current sprint** with this week's milestone and daily tasks (checkable inline)
- **Sprint history** — scrollable log of past weeks with scores
- **Success criteria** displayed at top
- **[Chat about]** opens `/chat?context=quest:swimming` for Claude to discuss pacing, suggest adjustments

### Weekly Reset Flow

Triggered from `/quests` or via chat (`"let's do my weekly reset"`). Claude walks through:

1. **Score sprints** — For each quest, "You planned 3 swim sessions this week. How many did you complete?"
2. **Pace check** — "Swimming is at 67% with 67% of time elapsed. You're on track."
3. **Flag risks** — "42sh is at 30% with 67% elapsed. Pace is 0.45 — at risk. Want to adjust scope or increase time?"
4. **Plan next sprints** — "For swimming W8, I suggest: 3 sessions, flip turns in full sets. Sound good?"
5. **Generate daily tasks** — Creates tasks for next week, assigned to specific days
6. **Save** — Sprint scores saved to Firestore, weekly summary synced to vault

### Annual Goals View (`/goals`)

- Year-level goals from `Goals-2026.md`
- Quarterly breakdown with checklist items
- Each goal links to relevant quests and projects
- End-of-quarter review prompt
- Visual: which goals have active quests vs. no quests attached

### Quest Cascade Data Model (Firestore)

```
users/{userId}/
  ├── quests/{questId}
  │     └── title: string
  │         category: "life" | "work"
  │         area: string
  │         parentGoal: goalId
  │         status: "not_started" | "in_progress" | "done" | "on_hold" | "abandoned"
  │         quarter: "Q1" | "Q2" | "Q3" | "Q4"
  │         year: number
  │         startDate: timestamp
  │         endDate: timestamp
  │         trackingMethod: "count" | "checklist" | "milestones"
  │         target: number
  │         current: number
  │         weeklyCommitment: string
  │         successCriteria: string
  │
  ├── quests/{questId}/sprints/{weekNumber}
  │     └── week: number (1-13)
  │         startDate: timestamp
  │         endDate: timestamp
  │         milestone: string
  │         status: "planned" | "in_progress" | "done" | "missed"
  │         score: number (0-100)
  │         notes: string
  │         tasks: [{
  │           title: string,
  │           day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  │           duration: number (minutes),
  │           status: "todo" | "done" | "skipped",
  │           taskId?: string (ref to tasks collection),
  │           notes?: string
  │         }]
  │
  └── goals/{goalId}
        └── title, year, quarter?,
            status: "active" | "completed" | "abandoned",
            linkedQuests[]
```

### Claude Tools for Quest Cascade

```typescript
const questTools = [
  // Quest-level
  { name: "getQuestProgress", params: { questId? } },
  // Returns: progress, pace, current sprint, pace alert status

  { name: "updateQuestProgress", params: { questId, current, note? } },
  // Manually update progress count

  { name: "getQuestPaceAlerts", params: {} },
  // Returns all quests with pace < 0.9

  // Sprint-level
  { name: "scoreWeeklySprint", params: { questId, week, score, notes? } },
  // Score a completed sprint (0-100)

  { name: "planWeeklySprint", params: { questId, week, milestone, tasks[] } },
  // Create next week's sprint with milestone and daily tasks

  { name: "getCurrentSprints", params: {} },
  // Returns this week's sprint for each active quest

  // Weekly reset
  { name: "generateWeeklyReset", params: {} },
  // Aggregates: all sprint scores, pace checks, suggests next week
  // Used by Claude during the weekly reset conversation

  // Daily
  { name: "getTodayQuestTasks", params: {} },
  // Returns today's quest-linked tasks across all active sprints
  // Used to populate dashboard and daily brief
]
```

---

## Obsidian Two-Way Sync

### Mechanism: GitHub as Bridge

Your Obsidian vault already syncs to `Samylay/obsidian` via GitHub Sync plugin (every 5 minutes). LifeOS reads from and writes to this repo via the GitHub API.

### Sync Architecture

```
Obsidian Vault ←→ GitHub Repo ←→ LifeOS App
   (local)        (Samylay/       (Vercel)
                   obsidian)

Obsidian → GitHub: Plugin auto-push (every 5 min)
GitHub → LifeOS:   API read on demand + Vercel Cron
LifeOS → GitHub:   API commit on write actions
GitHub → Obsidian: Plugin auto-pull (every 5 min)
```

### What Syncs

| LifeOS Action | Vault Effect |
|---------------|-------------|
| Complete daily review | Creates/updates `daily-notes/YYYY-MM-DD.md` with review content |
| Create/complete task | Updates relevant area or project `.md` file checklist |
| Update quest progress | Updates `04-Goals/Quarterly-Quests.md` |
| Archive project | Moves project `.md` to `08-Archives/` |
| Add note via chat | Creates entry in `01-Inbox.md` or relevant area file |

### What Doesn't Sync

- Chat conversation history (stays in Firestore only)
- Garmin raw data (stays in Firestore)
- UI state and preferences (stays in Firestore)

### Conflict Resolution

- **LifeOS writes win** for structured data (tasks, quests, daily logs)
- **Obsidian writes win** for free-form content (notes, knowledge, project descriptions)
- If both modified the same file: LifeOS appends its changes below a `<!-- LifeOS sync -->` marker rather than overwriting

---

## Data Model (Firestore)

```
users/{userId}/
  │
  ├── profile/settings
  │     └── displayName, email, timezone, energyPatterns{},
  │         garminConnected, googleCalConnected, vaultRepo
  │
  ├── tasks/{taskId}
  │     └── title: string
  │         area: "health" | "career" | "finance" | "brand" | "admin"
  │         project?: string (projectId ref)
  │         priority: "high" | "medium" | "low"
  │         status: "todo" | "in_progress" | "done"
  │         dueDate?: timestamp
  │         createdAt: timestamp
  │         completedAt?: timestamp
  │         source: "manual" | "chat" | "vault_sync"
  │
  ├── events/{eventId}
  │     └── title, start, end, category, allDay,
  │         source: "manual" | "google_calendar",
  │         googleEventId?, notes?
  │
  ├── notes/{noteId}
  │     └── content, area?, tags[], createdAt,
  │         processed: boolean, source: "chat" | "capture"
  │
  ├── quests/{questId}
  │     └── title, category: "life" | "work",
  │         area?, trackingMethod: "count" | "checklist" | "milestones",
  │         target: number, current: number,
  │         weeklyCommitment: string, successCriteria: string,
  │         quarter: "Q1"|"Q2"|"Q3"|"Q4", year: number,
  │         startDate, endDate,
  │         status: "not_started" | "in_progress" | "done" | "on_hold" | "abandoned",
  │         linkedGoal?: goalId
  │
  ├── quests/{questId}/sprints/{weekNumber}
  │     └── week: number (1-13), startDate, endDate,
  │         milestone: string,
  │         status: "planned" | "in_progress" | "done" | "missed",
  │         score: number (0-100), notes?: string,
  │         tasks: [{ title, day, duration, status, taskId?, notes? }]
  │
  ├── goals/{goalId}
  │     └── title, year, quarter?,
  │         status: "active" | "completed" | "abandoned",
  │         linkedQuests[], linkedProjects[]
  │
  ├── projects/{projectId}
  │     └── title, area, status: "planning" | "active" | "done" | "archived",
  │         target?: timestamp, nextAction?: string,
  │         linkedTasks[], notes?, createdAt
  │
  ├── habits/{habitId}
  │     └── name, frequency: "daily" | "weekly",
  │         area, currentStreak, longestStreak,
  │         history: [{ date, completed }]
  │
  ├── dailyLogs/{YYYY-MM-DD}
  │     └── sleepQuality: number (1-10),
  │         energy: number (1-10),
  │         mood?: number (1-10),
  │         gratitude?: string,
  │         reflection?: string,
  │         tomorrowTop3?: string[],
  │         reviewConversation?: string (chat log),
  │         briefContent?: string (cached daily brief)
  │
  ├── training/
  │     ├── plan/{weekId}
  │     │     └── phase: "base" | "build" | "peak" | "taper" | "race",
  │     │         weekNumber, sessions: [{
  │     │           day, type: "swim" | "bike" | "run" | "strength" | "rest",
  │     │           duration, zone?, notes?, completed, garminActivityId?
  │     │         }]
  │     ├── skills/{skillId}
  │     │     └── name, metric: "time" | "reps",
  │     │         history: [{ date, value }], target
  │     └── garmin/
  │           └── activities/{actId} — raw Garmin activity data
  │               dailySummaries/{date} — HR, HRV, sleep, stress
  │
  ├── chat/
  │     └── conversations/{convId}
  │           └── messages: [{ role, content, toolCalls?, timestamp }],
  │               createdAt, type: "general" | "daily_review" | "area_specific"
  │
  └── areas/{areaSlug}
        └── name, description, metrics{}, linkedProjects[], linkedTasks[]
```

---

## Screen Map

```
/                       → Command Center (Dashboard)
/chat                   → Full-screen Claude chat
/chat?context=health    → Chat pre-loaded with health area context
/chat?context=review    → Chat in daily review mode
/areas                  → Area overview grid
/areas/health           → Health & Training module
/areas/career           → Career & Learning module
/areas/finance          → Finance module (post-MVP)
/areas/brand            → Personal Brand module (post-MVP)
/areas/admin            → Life Admin module (post-MVP)
/projects               → Project kanban board
/projects/:id           → Project detail view
/quests                 → Quest kanban board
/goals                  → Annual goals + quarterly breakdown
/calendar               → Full calendar view (Google Cal + LifeOS events)
/settings               → Profile, integrations (Garmin, Google, GitHub)
```

---

## Design System

### Visual Direction: Minimal Dark

- **Background:** Near-black (`#0a0a0b`) with subtle card surfaces (`#141417`)
- **Text:** Off-white primary (`#ebebef`), muted secondary (`#71717a`)
- **Accent:** A single brand color for interactive elements (suggestion: cool blue `#3b82f6` or muted teal `#14b8a6`)
- **Borders:** Subtle (`#27272a`), used sparingly
- **Typography:** Inter or Geist Sans for UI, Geist Mono for metrics/data
- **Cards:** Rounded corners (`radius-lg`), no shadows, subtle border
- **Spacing:** Generous whitespace. Breathable. Never cramped.

### Component Library: shadcn/ui

Pre-built components used:
- `Card`, `Button`, `Input`, `Badge` — core UI
- `Dialog` — confirmation modals for Claude actions
- `Sheet` — side panels for detail views
- `Tabs` — switching between area sub-sections
- `Progress` — quest and skill progress bars
- `Calendar` — date picker for events/tasks
- `Command` — for any future command-palette needs

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| Desktop (1024px+) | Sidebar navigation + full content area |
| Tablet (768px) | Collapsible sidebar, stacked cards |
| Mobile (< 768px) | Bottom tab navigation, single-column, chat optimized |

---

## Implementation Phases

### Phase 0: Scaffold (Week 1)

- [ ] `npx create-next-app` with App Router + TypeScript
- [ ] Install and configure Tailwind CSS + shadcn/ui
- [ ] Configure as PWA (next-pwa or Serwist for service worker)
- [ ] Firebase project setup (Firestore + enable Google auth provider)
- [ ] NextAuth.js v5 setup with Google OAuth provider + Firestore adapter
- [ ] App shell: sidebar navigation with routes (Dashboard, Chat, Areas, Projects, Quests, Settings)
- [ ] Deploy to Vercel, configure environment variables
- [ ] Dark theme setup with CSS variables

### Phase 1: Core Loop (Weeks 2-4)

- [ ] **Dashboard layout** — Today's schedule (static mock), priority tasks, quest kanban
- [ ] **Task system** — Firestore CRUD, create/complete/edit tasks, filter by area
- [ ] **Chat interface** — Full-screen chat UI with message history
- [ ] **Claude integration** — Anthropic SDK in API route, tool definitions, streaming responses
- [ ] **Agentic tool use** — Claude can create tasks, add notes, list tasks via function calling
- [ ] **Quick capture via chat** — Type naturally, Claude parses into task/event/note
- [ ] **Daily log** — Basic check-in (sleep/energy via chat), stored in Firestore

### Phase 2: Calendar + Areas (Weeks 5-7)

- [ ] **Google Calendar OAuth2** — Connect account via Settings page
- [ ] **Calendar sync** — Fetch events, display on dashboard and `/calendar` view
- [ ] **Event creation** — Claude can create Google Calendar events via tool use
- [ ] **Conflict detection** — Check for overlaps before creating events
- [ ] **Health module** — Training plan view, bodyweight skill tracker, joint health checklist
- [ ] **Career module** — Skill map, JECT tracker, learning queue
- [ ] **Area module shared component** — Reusable layout for all area pages

### Phase 3: Training + Garmin (Weeks 8-9)

- [ ] **Garmin Connect OAuth2** — Connect account via Settings
- [ ] **Activity import** — Pull swim/bike/run activities with metrics
- [ ] **Daily summaries** — Pull resting HR, HRV, sleep data
- [ ] **Training plan engine** — Define weekly plan per phase, match Garmin activities to planned sessions
- [ ] **Periodization view** — Phase progression visual (Base → Build → Peak → Taper → Race)

### Phase 4: AI-Guided Reviews (Weeks 10-11)

- [ ] **Daily review flow** — Claude-guided evening conversation, structured questions, saves to dailyLog
- [ ] **Daily brief generation** — Morning auto-generated summary (Vercel Cron or on-load)
- [ ] **Weekly review** — Claude generates review from week's data (tasks, quests, training, notes)
- [ ] **Quest check-ins** — Claude proactively nudges about behind-pace quests

### Phase 5: Vault Sync + Projects (Weeks 12-13)

- [ ] **GitHub API integration** — Read/write to Samylay/obsidian repo
- [ ] **Daily note sync** — Push daily review to vault as `daily-notes/YYYY-MM-DD.md`
- [ ] **Task/quest sync** — Update checklists in vault project and goal files
- [ ] **Project kanban** — Board view, drag between columns, project detail page
- [ ] **Project templates** — Create from template, link tasks, archive to `08-Archives`

### Phase 6: Notifications + Polish (Weeks 14-16)

- [ ] **Browser push notifications** — Service worker registration, permission prompt
- [ ] **Notification triggers** — Task due, reminder fired, daily review prompt, quest nudge
- [ ] **Mobile-responsive pass** — Bottom tab nav, touch-optimized chat, stacked cards
- [ ] **PWA install prompt** — "Add to Home Screen" banner
- [ ] **Loading states, error handling, empty states** — Polish for all views
- [ ] **Offline support** — Firestore offline persistence for core data

### Post-MVP (Backlog)

- [ ] Finance module (budget, subscriptions)
- [ ] Personal Brand module (content calendar, publishing log)
- [ ] Life Admin module (recurring tasks, document tracker)
- [ ] Voice input (Web Speech API → Claude chat)
- [ ] n8n webhook endpoints for external automation
- [ ] Full i18n (French + English)
- [ ] Obsidian plugin (native two-way sync, replacing GitHub bridge)

---

## What This Replaces vs. What Stays

| Tool | Verdict | Reason |
|------|---------|--------|
| **Obsidian vault** | **Stays + syncs** | Long-form notes and knowledge stay in Obsidian. Operational data syncs bidirectionally via GitHub |
| **Google Calendar** | **Integrates** | LifeOS reads/writes to it. Google Calendar remains the scheduling source of truth |
| **Garmin** | **Integrates** | LifeOS pulls workout and health data. Garmin stays for recording activities |
| **Scattered task lists** | **Replaced** | All tasks live in LifeOS, manageable via chat or UI |
| **Manual daily notes** | **Replaced** | AI-guided daily review in chat, synced to vault |
| **Spreadsheet budgeting** | **Replaced (post-MVP)** | Finance module handles basic tracking |
| **Mental tracking of quests** | **Replaced** | Visual kanban quest board in the app |
| **Manual training logs** | **Replaced** | Garmin auto-import + structured training plan |

---

## Success Criteria for MVP

The app is useful when you can:

1. Open the dashboard in the morning and see today's schedule + AI brief
2. Open chat and say "add a swim session Friday at 6pm" and have it appear in Google Calendar
3. Do an AI-guided evening review and have it sync to your Obsidian vault
4. See your quarterly quests as a kanban board with real progress numbers
5. Check your training plan and see which sessions are completed (via Garmin)
6. View your skill map and JECT project status in the Career module
