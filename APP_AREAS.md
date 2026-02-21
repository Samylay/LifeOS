# LifeOS — App Areas, Purposes & Features

A complete inventory of every area and feature in the LifeOS application.

---

## Life Areas

### 1. Health & Training

**Purpose**: Track physical fitness, wellness metrics, and training progress.

**Features**:

- **Bodyweight Skills Tracker** — Track progression on skills (handstands, pistol squats, one-arm pushups, etc.) with progress percentage
- **Joint Health Checklist** — Daily exercises (bird-dogs, glute bridges, planks, etc.) with completion tracking
- **Garmin Integration** — Sync activities (running, cycling, strength, yoga), daily steps, heart rate metrics (resting, min, max, 7-day avg), sleep tracking with stages (deep, light, REM, awake) and scores, body battery, HRV
- **Wellbeing Pulse** — Daily check-ins for sleep quality, energy, and mood (1–5 scale)
- **Area Metrics** — Training sessions/week, last night sleep duration, daily steps

---

### 2. Career & Learning

**Purpose**: Professional development, skill building, and portfolio management.

**Features**:

- **Skill Tree** — Multi-category skill tracking (Web Dev, AI/LLM, Cybersecurity) with 5-level proficiency system (React/Next.js, TypeScript, Tailwind, Node.js, Prompt Engineering, LLM Integration, Reverse Engineering, CTF Challenges, Network Security)
- **JECT Project Tracker** — Dedicated tracking for Junior Enterprise client projects
- **Learning Queue** — Personal learning backlog (Courses, Books, Tutorials, Topics)
- **Portfolio Items** — Portfolio projects with status tracking (In Progress, Completed, Ongoing)
- **Area-Specific Notes** — Linked learning notes and insights
- **Area Metrics** — Focus time today (hours), skills tracked, portfolio items

---

### 3. Finance

**Purpose**: Money management, budgeting, subscriptions, and financial goals.

**Features**:

- **Budget Tracker** — Monthly budget by category (Housing, Food, Transport, Subscriptions, Health, Entertainment, Other) with actual vs. budget comparison, visual progress bars, color-coded over/under, remaining budget calculation
- **Subscription Manager** — Track recurring expenses (monthly/yearly), monthly cost aggregation, frequency tracking
- **Savings Goals** — Goal-based savings with target amount, current progress, percentage complete, and amount remaining
- **Area Metrics** — Monthly budget total, subscription costs, savings rate percentage

---

### 4. Personal Brand

**Purpose**: Content creation, audience building, and personal brand development.

**Features**:

- **Content Calendar** — Track content across platforms (Instagram, YouTube, Mailing List, LinkedIn, Twitter) with status lifecycle: Draft → Scheduled → Published, platform-specific color coding, date tracking
- **Publishing Log** — Historical record of published content
- **Ideas Backlog** — Capture and store content ideas with tagging, quick idea entry, idea-to-content pipeline
- **Area Metrics** — Posts published this week, content planned, ideas in backlog

---

### 5. Life Admin

**Purpose**: Administrative tasks, recurring duties, and document management.

**Features**:

- **Recurring Tasks** — Lifestyle maintenance tasks with frequency options (Daily, Weekly, Monthly, Quarterly, Yearly), overdue tracking with visual alerts, next due date management
- **Admin Inbox** — Quick capture for administrative items, process and mark items done, separate from main task system
- **Document Tracker** — Important document management with storage location tracking, expiry date monitoring (alerts for documents expiring within 30 days)
- **Area Metrics** — Overdue items count, active admin tasks, tracked documents

---

## Cross-Cutting Features

Features that span all areas or operate independently.

### Dashboard (Home)

- **Morning View** — Daily habits with streaks, priority tasks (top 5 by urgency), quick action cards (Workouts, Reading), energy check-in, Google Calendar (today's schedule), focus session quick-start
- **Evening View** — Day review statistics (sessions, minutes, tasks done, habits), completed tasks recap, tomorrow's top 3 planning, gratitude & reflection prompts
- **Quick Stats** — Habits completed, workouts this week, tasks done today

### Focus / Pomodoro Timer

- Configurable timer (default: 25 min focus, 5 min break, 15 min long break)
- Visual progress ring with live countdown
- Session counter with long break cycle
- Interruption tracking
- Area linking (assign focus sessions to life areas)
- Daily statistics (sessions completed, minutes focused)
- Auto-start, pause/resume/stop controls

### Tasks

- Properties: title, area, project, priority (low/medium/high/urgent), status (todo/in-progress/done/cancelled), due date
- Priority-based sorting
- Project linking and area categorization
- Creation from capture, voice commands, or direct entry

### Habits

- Daily or weekly frequency
- Streak counting with visual indicator
- Completion history with date tracking
- Area association
- Quick toggle completion

### Goals

- Year-based goals with year navigation
- Quarterly breakdown (Q1–Q4) and annual goals
- Status: Active, Completed, Abandoned
- Linked project associations

### Projects

- Kanban board view: Planning → Active → Paused → Completed
- List view alternative
- Project linking to areas
- Task aggregation within projects
- Progress tracking (tasks done %)
- Next action field and target date tracking
- Weekly review banner (highlights stale projects on weekends)
- Archive functionality

### Workouts

- Exercise library by muscle group (Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio, Flexibility)
- Set tracking (reps × weight)
- Workout rating (1–5 stars)
- Workout notes
- Stats: this week, this month, total volume
- Workout history timeline
- Garmin data integration

### Reminders

- Frequency: Once, Daily, Weekly, Monthly, Yearly
- Time-specific reminders
- Due date tracking and area association
- Status groups: Overdue (red), Due Today, Upcoming, Completed
- Notes field

### Reading / Book Tracker

- Status lifecycle: Want to Read → Currently Reading → Finished → Abandoned
- Reading progress (current page / total pages with percentage)
- Author tracking, rating (1–5 stars), start/finish dates
- Notes per book
- Stats: books reading, finished this year, to-read list

### Calendar

- **Google Calendar Embed** — Full calendar (Week/Month/Agenda), OAuth integration, configurable calendar ID and timezone
- **LifeOS View** — API-powered week view with daily columns, event time display, location tracking, week navigation
- **Quick Add Events** — Title, date, start/end time, description with auto-sync to Google Calendar

### Quick Capture

- One-line capture for tasks, notes, reminders
- Voice command support (e.g., "Remove the grocery shopping task")
- AI-assisted intelligent parsing
- Flash animation on successful capture

### AI Assistant

- Paste notes, brain dumps, meeting transcripts
- Automatic extraction of tasks, goals, habits, projects, reminders
- Action results show what was created
- Clipboard paste integration

### Daily Log

- Sleep quality, energy level, mood (1–5 each)
- Gratitude prompts
- Evening reflection
- Tomorrow's top 3 tasks

### Settings

- Google Calendar integration config
- Garmin Connect integration config
- Focus timer settings
- User profile management

---

## Integrations

| Integration | Details |
|---|---|
| **Google Calendar** | OAuth-based auth, read/write events, display in dashboard + calendar page, quick event creation |
| **Garmin Connect** | Activity sync, daily health metrics (steps, HR, sleep, body battery, HRV), auto + manual sync |
| **Firebase** | Authentication (email/Google), Firestore database, real-time persistence, user profiles |
| **AI/LLM APIs** | OpenAI + Anthropic APIs for voice command processing, task extraction from notes, intelligent capture |

---

## Tech Stack

- **Framework**: Next.js (App Router) with React 19, TypeScript
- **State**: Zustand
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Styling**: Tailwind CSS v4 with CSS variables
- **Icons**: Lucide React
- **Font**: Geist (monospace for numbers)
- **Design**: Mobile-first responsive, PWA-capable
