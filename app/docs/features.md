# LifeOS App — Features

## Phase 0: Foundation (Complete)

### App Shell
- **Sidebar navigation**: Collapsible (64px collapsed / 256px expanded) with icon + label for each route
- **Top bar**: Sticky header with quick capture input, notification bell, user avatar
- **Auth gate**: Shows login screen when Firebase is configured and user is not signed in; bypasses auth in demo mode
- **Theme system**: Light/dark theme via CSS custom properties, respects `prefers-color-scheme`

### Design Tokens
All design tokens from the UX/UI spec are implemented in `globals.css`:
- Emerald brand scale (50-950)
- Slate neutral scale (50-950)
- Area colors: Health (teal), Career (indigo), Finance (amber), Brand (violet), Admin (slate)
- Tier colors for Hero Journey progression
- Semantic colors (success, warning, danger, info)
- Z-index scale, animation durations, shadow scale

### Data Model
Full TypeScript types for all Firestore collections in `src/lib/types.ts`:
- UserProfile, FocusSettings
- Task, CalendarEvent, Note
- Quest, Goal, Project, Habit
- DailyLog, FocusSession, FocusBlock
- Journey, Streaks, StreakData
- Transaction, Subscription, Area

### Firestore Helpers
Generic CRUD library in `src/lib/firestore.ts` with typed helpers for every collection.

---

## Phase 1: Core Loop + Focus Engine (Complete)

### Task System
**Hook**: `useTasks()` — `src/lib/use-tasks.ts`
**Components**: `TaskList`, `TaskItem`, `TaskCreateForm` — `src/components/task-list.tsx`

#### Usage
```tsx
import { useTasks } from "@/lib/use-tasks";

const { tasks, loading, createTask, updateTask, deleteTask } = useTasks();

// Create
await createTask({ title: "My task", priority: "high", status: "todo", area: "career" });

// Update (e.g., mark done)
await updateTask(taskId, { status: "done" });

// Delete
await deleteTask(taskId);
```

#### Task Fields
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Task title |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` | Priority level |
| `status` | `"todo" \| "in_progress" \| "done" \| "cancelled"` | Current status |
| `area` | AreaId (optional) | Linked life area |
| `projectId` | string (optional) | Linked project |
| `dueDate` | Date (optional) | Due date |

#### UI Behavior
- Click the status icon to cycle: todo → in_progress → done
- Priority shown as colored dot (red=urgent, amber=high, blue=medium, slate=low)
- Area badge displayed below title
- Hover to reveal delete button
- Filter by status and area in TaskList

---

### Focus Timer
**Hook**: `useFocusTimer()` — `src/lib/use-focus.ts`
**Page**: `/focus` — `src/app/focus/page.tsx`

#### Usage
```tsx
import { useFocusTimer } from "@/lib/use-focus";

const {
  timerState,        // "idle" | "running" | "paused"
  sessionType,       // "focus" | "break" | "long_break"
  timeRemaining,     // seconds
  totalTime,         // seconds (for progress calculation)
  completedSessions, // count in current cycle
  interruptions,     // pause count during current session

  linkedArea,        // AreaId | undefined
  setLinkedArea,     // setter
  linkedTaskId,      // string | undefined
  setLinkedTaskId,   // setter

  start, pause, resume, stop, skip,

  todaySessions,           // FocusSession[]
  todayFocusMinutes,       // number
  todayCompletedSessions,  // number

  config,  // { focusDuration, breakDuration, longBreakDuration, longBreakAfter }
} = useFocusTimer();
```

#### Timer State Machine
```
idle → (start) → running → (pause) → paused → (resume) → running
                     ↓                            ↓
                  (stop)                        (stop)
                     ↓                            ↓
               idle (logs session)          idle (logs session)

running → (time reaches 0) → session complete → idle (auto-advance to next type)
```

#### Session Auto-Advance
1. Focus complete → Short Break
2. Short Break complete → Focus
3. Every N focus sessions (default 4) → Long Break instead of Short Break
4. Long Break complete → Focus

#### Session Logging
When a focus session ends (completed or stopped), it's saved to Firestore:
- **completed**: Timer ran to zero
- **partial**: Stopped after ≥50% of planned duration
- **abandoned**: Stopped before 50% of planned duration

Breaks are not logged.

#### Firestore Path
```
users/{userId}/focusSessions/{sessionId}
```

#### Default Durations
| Mode | Duration |
|------|----------|
| Focus | 25 min |
| Short Break | 5 min |
| Long Break | 15 min |
| Long break after | 4 sessions |

---

### Daily Log
**Hook**: `useDailyLog()` — `src/lib/use-daily-log.ts`
**Components**: `MorningCheckIn`, `EveningReflection` — `src/components/daily-log.tsx`

#### Usage
```tsx
import { useDailyLog } from "@/lib/use-daily-log";

const { log, loading, updateLog, todayKey } = useDailyLog();

// Rate sleep quality
await updateLog({ sleepQuality: 4 });

// Save reflection
await updateLog({ gratitude: "Good weather today", reflection: "Productive morning" });
```

#### Daily Log Fields
| Field | Type | Description |
|-------|------|-------------|
| `date` | string (YYYY-MM-DD) | Document ID |
| `sleepQuality` | 1-5 (optional) | Morning check-in |
| `energy` | 1-5 (optional) | Morning check-in |
| `mood` | 1-5 (optional) | Morning check-in |
| `gratitude` | string (optional) | Evening reflection |
| `reflection` | string (optional) | Evening reflection |
| `focusSessions` | number | Auto-updated |
| `focusMinutes` | number | Auto-updated |
| `streakDay` | number | Auto-updated |

#### Firestore Path
```
users/{userId}/dailyLogs/{YYYY-MM-DD}
```

---

### Quick Capture
**Location**: Top bar (`src/components/top-bar.tsx`)

#### How It Works
1. Type anything in the capture bar
2. Press Enter
3. Text is saved as a new task with `priority: "medium"` and `status: "todo"`
4. Input clears, emerald glow flash confirms capture

**Phase 4 upgrade**: LLM will parse input to create tasks, events, notes, or reminders based on content.

---

### Focus Streaks
**Hook**: `useStreaks()` — `src/lib/use-streaks.ts`

#### Usage
```tsx
import { useStreaks } from "@/lib/use-streaks";

const { streaks, loading, recordFocusDay } = useStreaks();

// streaks.focus.current   — current consecutive days
// streaks.focus.longest   — all-time best streak
// streaks.focus.lastActiveDate — "YYYY-MM-DD"

// Call when user starts a focus session
await recordFocusDay();
```

#### Streak Logic
- If `lastActiveDate === today`: no-op (already recorded)
- If `lastActiveDate === yesterday`: increment streak
- Otherwise: reset streak to 1

#### Firestore Path
```
users/{userId}/streaks/data
```

---

### Dashboard (Command Center)
**Page**: `/` — `src/app/page.tsx`

#### Morning View
| Card | Grid Span | Data Source |
|------|-----------|-------------|
| Today's Schedule | 8 cols | Google Calendar (placeholder — Phase 4) |
| Morning Check-in | 4 cols | `useDailyLog` — sleep, energy, mood pickers |
| Priority Tasks | 4 cols | `useTasks` — top 5 active tasks by priority |
| Focus Streak | 4 cols | `useStreaks` + `useFocusTimer` — streak, sessions, minutes, best |
| Active Quests | 4 cols | Placeholder (Phase 3) |
| Hero Journeys | 8 cols | Placeholder (Phase 3) |
| Daily Brief | 4 cols | Placeholder (Phase 4 — LLM) |

#### Evening View
| Card | Grid Span | Data Source |
|------|-----------|-------------|
| Day Review | 8 cols | `useFocusTimer` + `useTasks` — sessions, minutes, tasks done |
| Streak Tracker | 4 cols | `useStreaks` — current streak, best |
| Tomorrow's Top 3 | 6 cols | Local state — 3 text inputs |
| Evening Reflection | 6 cols | `useDailyLog` — gratitude, reflection |

#### View Toggle
Morning/Evening toggle in the page header. Defaults to Morning.

---

## Phase 2: Life Areas + Focus Blocks + Projects (Complete)

### Shared Area Module Layout
**Component**: `AreaModule` — `src/components/area-module.tsx`

Shared layout for all five life areas, providing a consistent structure with:
- **Key Metrics** card (area-colored left border)
- **Habits** card with daily toggle, streak tracking, add/delete
- **Active Tasks** card with area-filtered tasks, inline create form
- **Area-specific content** (passed as children)
- **Quick Notes** section (optional)

Sub-components: `MetricCard`, `HabitList`, `QuickNotes`

---

### Health Module
**Page**: `/areas/health` — `src/app/areas/health/page.tsx`

| Feature | Description |
|---------|-------------|
| Bodyweight Skill Tracker | Progress bars for handstand, pistol squat, one-arm pushup with current/target levels |
| Joint Health Checklist | Daily prehab exercises checklist (bird-dogs, glute bridges, planks, hip circles, shoulder dislocates) |
| Training Log | Session list (Garmin integration placeholder for Phase 6) |
| Wellbeing Pulse | Today's sleep/energy/mood from Daily Log as progress bars |

---

### Career Module
**Page**: `/areas/career` — `src/app/areas/career/page.tsx`

| Feature | Description |
|---------|-------------|
| Skill Tree | Categorized skills (Web Dev, AI/LLM, Cybersecurity) with 5-level rating bars |
| JECT Project Tracker | Lists career-linked projects from Projects page |
| Learning Queue | Ordered learning items (courses, books, tutorials) with add/remove |
| Portfolio | Project showcase with completion status badges |

---

### Finance Module
**Page**: `/areas/finance` — `src/app/areas/finance/page.tsx`

| Feature | Description |
|---------|-------------|
| Budget vs. Actual | Category-by-category budget comparison with color-coded progress bars |
| Subscription Tracker | CRUD for subscriptions with monthly/yearly toggle, auto-calculated monthly total |
| Savings Goals | Target-based savings progress bars with percentage and remaining amount |

**Hook**: `useSubscriptions()` — `src/lib/use-subscriptions.ts`

---

### Personal Brand Module
**Page**: `/areas/brand` — `src/app/areas/brand/page.tsx`

| Feature | Description |
|---------|-------------|
| Content Calendar | Plan content across platforms (Instagram, YouTube, LinkedIn, Twitter, Mailing List) with date/status |
| Publishing Log | History of published content (placeholder) |
| Ideas Backlog | Quick-add content ideas stored as notes, filterable by area |

---

### Life Admin Module
**Page**: `/areas/admin` — `src/app/areas/admin/page.tsx`

| Feature | Description |
|---------|-------------|
| Recurring Tasks | Scheduled tasks with frequency (daily/weekly/monthly/quarterly/yearly), overdue detection |
| Admin Inbox | Quick-add admin items backed by notes, "Done" to process |
| Document Tracker | Important documents with storage location and expiry date tracking (expiring soon / expired alerts) |

---

### Project Tracker
**Page**: `/projects` — `src/app/projects/page.tsx`
**Hook**: `useProjects()` — `src/lib/use-projects.ts`

#### Features
- **Kanban board view** with 4 columns: Planning, Active, Paused, Completed
- **List view** toggle
- **Project cards** with status badges, area tags, progress bars, next action, target date
- **CRUD operations**: Create projects with title, area, status, next action, target date
- **Task linking**: Expand project to view/add linked tasks
- **Archive**: Move projects to archive via context menu
- **Status transitions**: Change project status from context menu

#### Project Fields
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Project name |
| `area` | AreaId (optional) | Linked life area |
| `status` | `"planning" \| "active" \| "paused" \| "completed"` | Current status |
| `nextAction` | string (optional) | Next actionable step |
| `targetDate` | Date (optional) | Target completion date |
| `linkedTaskIds` | string[] | Associated task IDs |

---

### Focus Blocks
**Page**: `/focus/blocks` — `src/app/focus/blocks/page.tsx`
**Hook**: `useFocusBlocks()` — `src/lib/use-focus-blocks.ts`

#### Features
- **Block scheduling** with date, start/end time, area, goal
- **Session chaining**: Auto-calculates sessions from block duration (session + break cycle)
- **Quick templates**: Morning Deep Work 2h, Afternoon Focus 1.5h, Evening Study 1h, Sprint 45min
- **Buffer time**: Configurable buffer between end of sessions and block end
- **Status management**: Scheduled → Active → Done
- **Today/Upcoming/Past** grouping

#### Block Fields
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Block name |
| `date` | string (YYYY-MM-DD) | Scheduled date |
| `startTime` / `endTime` | string (HH:MM) | Time range |
| `sessionDuration` | number | Focus session length (min) |
| `breakDuration` | number | Break length (min) |
| `bufferMinutes` | number | Buffer time at end |
| `sessionCount` | number | Auto-calculated session count |
| `autoStart` | boolean | Auto-start next session |
| `goal` | string (optional) | Block goal description |

---

### Calendar View
**Page**: `/calendar` — `src/app/calendar/page.tsx`

#### Features
- **Weekly calendar grid** (Monday–Sunday) with navigable week offset
- **Focus blocks** rendered as color-coded cards (area color) in day columns
- **Google Calendar events** rendered as blue cards alongside focus blocks
- **Today highlight** with emerald accent background and circled date
- **Google Calendar connection** inline prompt when not connected
- **Week navigation**: Previous/Next week buttons + "Today" reset

---

### New Data Hooks

| Hook | File | Description |
|------|------|-------------|
| `useProjects()` | `src/lib/use-projects.ts` | CRUD for projects collection |
| `useHabits()` | `src/lib/use-habits.ts` | CRUD for habits with area filtering, daily toggle |
| `useFocusBlocks()` | `src/lib/use-focus-blocks.ts` | CRUD for focus blocks, session calculation |
| `useNotes()` | `src/lib/use-notes.ts` | CRUD for notes with area filtering |
| `useSubscriptions()` | `src/lib/use-subscriptions.ts` | CRUD for finance subscriptions, monthly cost calc |
