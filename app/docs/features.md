# Stride App — Features

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
- Tier colors for goal progression
- Semantic colors (success, warning, danger, info)
- Z-index scale, animation durations, shadow scale

### Data Model
Full TypeScript types for all Firestore collections in `src/lib/types.ts`:
- UserProfile, FocusSettings
- Task, CalendarEvent, Note
- Goal, Project, Habit
- DailyLog, FocusSession
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
| `tasksCompleted` | number | Auto-updated |

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

### Dashboard (Command Center)
**Page**: `/` — `src/app/page.tsx`

#### Morning View
| Card | Grid Span | Data Source |
|------|-----------|-------------|
| Today's Schedule | 8 cols | Google Calendar (placeholder — Phase 4) |
| Morning Check-in | 4 cols | `useDailyLog` — sleep, energy, mood pickers |
| Priority Tasks | 4 cols | `useTasks` — top 5 active tasks by priority |
| Focus Stats | 4 cols | `useFocusTimer` — sessions, minutes today |
| Active Goals | 4 cols | `useGoals` — in-progress goals |
| Daily Brief | 4 cols | Placeholder (Phase 4 — LLM) |

#### Evening View
| Card | Grid Span | Data Source |
|------|-----------|-------------|
| Day Review | 8 cols | `useFocusTimer` + `useTasks` — sessions, minutes, tasks done |
| Tomorrow's Top 3 | 6 cols | Local state — 3 text inputs |
| Evening Reflection | 6 cols | `useDailyLog` — gratitude, reflection |

#### View Toggle
Morning/Evening toggle in the page header. Defaults to Morning.

---

## Phase 2: Life Areas + Projects (Complete)

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

### Calendar View
**Page**: `/calendar` — `src/app/calendar/page.tsx`

#### Features
- **Google Calendar embed** as primary view (iframe with configurable calendar ID + timezone)
- **Embed mode toggle**: Week / Month / Agenda views
- **Stride View fallback**: API-powered weekly calendar grid when embed isn't available
- **Quick Add Event**: Create events via Google Calendar API directly from the page
- **Embed settings**: Configurable calendar ID and timezone
- **Setup guide**: Instructions for enabling public calendar access for embed
- **Connection prompt**: Inline prompt when Google Calendar is not connected

---

### New Data Hooks

| Hook | File | Description |
|------|------|-------------|
| `useProjects()` | `src/lib/use-projects.ts` | CRUD for projects collection |
| `useHabits()` | `src/lib/use-habits.ts` | CRUD for habits with area filtering, daily toggle |
| `useNotes()` | `src/lib/use-notes.ts` | CRUD for notes with area filtering |
| `useSubscriptions()` | `src/lib/use-subscriptions.ts` | CRUD for finance subscriptions, monthly cost calc |

---

## Todoist-Inspired Feature Roadmap

Features distilled from Todoist's feature set, filtered to what matters for a **solo personal app** (no team/org/sharing features). Organized by realistic implementation priority.

### Already Built

| Feature | Stride Equivalent |
|---------|-------------------|
| Task CRUD with priorities | 4 priority levels, status cycling, area tagging |
| Quick capture | Top bar input → creates task on Enter |
| Projects | Kanban board with 4 status columns |
| Recurring tasks | Reminders system with daily/weekly/monthly/yearly frequency |
| Habit tracking | Daily toggle with streak tracking per habit |
| Labels/tags | Area system (Health, Career, Finance, Brand, Admin) |
| Due dates | Date picker on task creation |
| Calendar view | Google Calendar embed + Stride weekly grid + Quick Add Event |
| Board layout (Kanban) | Project tracker with drag-and-drop columns |
| Dark mode | CSS custom properties with system preference detection |
| Mobile responsive | Responsive layout + bottom nav + PWA manifest |
| Voice input | Web Speech API for task creation |
| Google Calendar (read) | OAuth + event fetching + display on calendar |
| Reminders | Recurring reminders with due date tracking |

### Do Now — High Value, Low Complexity

These can be built with the existing stack and data model. No external API or LLM dependency.

#### 1. Sub-tasks (Task Nesting)
- Add `parentId` field to Task type
- Indent child tasks under parent in TaskList
- Collapse/expand toggle on parent tasks
- **Why now:** Core task management feature, simple data model change

#### 2. Task Descriptions
- Add `description` field to Task type (plain text or markdown)
- Expandable description area below task title
- **Why now:** Tasks often need context beyond a title

#### 3. Natural Language Date Parsing
- Use `chrono-node` library (no LLM needed) to parse "tomorrow", "next Friday", "March 5" from quick capture
- Auto-extract date from capture text and set as `dueDate`
- **Why now:** Massive QoL improvement for quick capture, zero API cost

#### 4. Today View
- Filtered task list: tasks where `dueDate === today` OR `status === in_progress`
- Separate from Dashboard — dedicated `/today` route
- Group by: overdue / today / no date
- **Why now:** The single most-used view in Todoist, simple filter query

#### 5. Task Sort & Group Options
- Sort by: due date, priority, name, created date
- Group by: area, priority, due date, project
- Persist sort preference per view
- **Why now:** Already have all the data fields, just need UI controls

#### 6. Drag-and-Drop Task Reordering
- Add `sortOrder` field to tasks
- Drag-and-drop within task lists (use `@dnd-kit/sortable` or similar)
- **Why now:** Manual ordering is essential when auto-sort isn't enough

#### 7. Sections Within Projects
- Add `sections` array to Project type (or separate collection)
- Group tasks under named sections within a project view
- **Why now:** Projects with 10+ tasks need internal structure

#### 8. Task Duration / Time Estimates
- Add `estimatedMinutes` field to Task type
- Display as badge on task card
- Sum estimates in Today view header ("~2.5h of work planned")
- **Why now:** Helps estimate daily workload — know how much is on your plate

#### 9. Completed Tasks Archive
- `/tasks/completed` route showing done/cancelled tasks
- Filter by date range, area, project
- Undo: restore task back to todo
- **Why now:** Currently completed tasks just disappear from view

#### 10. Upcoming View
- `/upcoming` route showing tasks grouped by day for next 7/14/30 days
- Overdue section at top
- "No date" section at bottom
- **Why now:** See what's coming without checking the calendar

### Do Later — Valuable But Complex

These depend on LLM integration, external APIs, or significant new infrastructure.

#### LLM-Powered (Phase 4 dependency)
| Feature | Complexity | Notes |
|---------|-----------|-------|
| Smart quick capture (text → task/event/note/reminder) | Medium | Needs Gemini function calling |
| AI task breakdown ("Break this down") | Medium | Suggest sub-tasks from a parent task title |
| Priority suggestions | Low | LLM ranks tasks based on due dates + context |
| Smart scheduling | High | Suggest optimal time slots based on energy patterns |
| Filter Assist (natural language → filter query) | Medium | "Show me overdue career tasks" → filter params |

#### Integration-Dependent
| Feature | Complexity | Dependency |
|---------|-----------|------------|
| Two-way Google Calendar sync | High | Webhook/polling infrastructure |
| Email-to-task | Medium | Email parsing service or Gmail API |
| Zapier/n8n automation triggers | Medium | Webhook endpoint infrastructure |
| Location-based reminders | High | Needs native mobile app (not PWA) |

#### Analytics (Phase 5)
| Feature | Complexity | Notes |
|---------|-----------|-------|
| Productivity charts (daily/weekly/monthly) | Medium | Recharts already in deps |
| Task completion trends | Low | Track completion rates over time |
| Activity history feed | Low | Aggregate actions across collections |
| Daily/weekly completion goals | Low | Target setting + progress tracking |

#### Social & Nutrition Integration
| Feature | Complexity | Notes |
|---------|-----------|-------|
| Instagram meal sharing — share meals from Instagram directly to Stride | Medium | Share sheet / deep link integration to capture meal posts into a nutrition or health log. Detailed implementation TBD |

#### From Original Vision (LLM-Calendar Project)

Features from the original LLM-Calendar project that inspired Stride, not yet implemented:

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Event conflict resolution | Medium | LLM detects scheduling conflicts and proposes alternatives automatically |
| Availability search (free time slot finder) | Medium | "When am I free this week for 2 hours?" — scans calendar and suggests slots |
| Proactive planning | High | AI generates structured daily/weekly plans for user confirmation |
| Voice journaling with agent actions | Medium | Voice note capture where the AI extracts actions (e.g., "remind me in 2 weeks") |
| Risk flagging | Low | Flag risky commitments or overloaded days, visible on dashboard |
| Wellbeing-aware scheduling | High | Deep personalization — factor in glycemic peaks, energy patterns, sleep data, and mental state when suggesting schedule changes |

#### From Design Document (Gamification & Mastery)

Features from the original LifeOS design document, deferred during scope reduction but still planned:

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Focus Blocks (time blocks) | High | Pre-scheduled focus blocks on calendar with goals, session chaining, buffer time, and Google Calendar sync |
| Focus Shield (distraction blocking) | High | Blocklist/allowlist mode during focus sessions — browser extension or Service Worker interception |
| Session Analytics (heatmaps & charts) | Medium | Focus time by area (donut chart), best focus times (heatmap by hour × day), average completion rate |
| Hero Journeys (mastery progression) | High | Long-term skill paths with tiered progression (Novice → Grandmaster over 10,000 hours). Auto-tracks from focus sessions |
| Quarterly Quests | Medium | 90-day focused challenges with clear success criteria, progress tracking, and end-of-quarter review |
| Enhanced Streaks | Medium | Area-specific streaks, streak shields (1 missed day/week allowed), milestones at 7/30/60/100/365 days, streak recovery |
| Weekly review assistant (LLM) | Medium | AI-generated weekly review from completed tasks, missed goals, focus stats, and upcoming deadlines |
| Schedule optimization (LLM) | High | LLM suggests optimal time slots for tasks based on energy patterns, calendar gaps, and task type |
| Quest check-in prompts (LLM) | Low | Periodic AI prompt: "You're at 40% on your swimming quest with 5 weeks left. Want to schedule more sessions?" |
| Daily brief generation (LLM) | Medium | Morning AI summary: today's schedule, conflicts, priority suggestions based on energy and deadlines |
| Obsidian vault sync | High | Two-way sync between Stride and Obsidian vault (e.g., auto-generate daily notes as .md files) |

### Skip — Doesn't Fit Stride

| Todoist Feature | Why Skip |
|----------------|----------|
| Shared projects / collaboration | Solo personal app |
| Team workspaces | Solo personal app |
| Comments on tasks | Overkill — use description field instead |
| File attachments | Obsidian handles documents and files |
| Browser extension | Quick capture in-app is sufficient for now |
| Email forwarding | Low priority for personal use |
| Smartwatch app | Garmin integration covers health; tasks can wait |

### Priority Implementation Order

```
Sprint A (next): Sub-tasks, Descriptions, NL Date Parsing, Today View
Sprint B:        Sort/Group, Drag Reorder, Upcoming View, Completed Archive
Sprint C:        Sections, Duration Estimates, Custom Filters
Sprint D (LLM):  Smart Capture, Task Breakdown, Priority Suggestions, Daily Brief
Sprint E:        Productivity Charts, Completion Trends, Activity Feed, Session Analytics
Sprint F:        Focus Blocks, Quarterly Quests, Enhanced Streaks
Sprint G:        Hero Journeys, Weekly Review Assistant, Schedule Optimization
Sprint H:        Instagram Meal Sharing, Wellbeing-Aware Scheduling, Obsidian Sync
```
