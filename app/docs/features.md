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
