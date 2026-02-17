# LifeOS App — Firestore Schema

## Collection Structure

All data is scoped per user under `users/{userId}/`.

```
users/{userId}/
├── profile/settings              # UserProfile document
├── tasks/{taskId}                # Task documents
├── events/{eventId}              # Calendar event documents
├── notes/{noteId}                # Note documents
├── quests/{questId}              # Quest documents
├── goals/{goalId}                # Goal documents
├── projects/{projectId}          # Project documents
├── habits/{habitId}              # Habit documents
├── dailyLogs/{YYYY-MM-DD}       # Daily log documents (date as ID)
├── focusSessions/{sessionId}     # Focus session documents
├── focusBlocks/{blockId}         # Focus block documents
├── journeys/{journeyId}          # Hero Journey documents
├── streaks/data                  # Single document for all streak data
├── settings/integrations         # Integration connection state (gcal, garmin)
├── areas/{areaId}                # Area metadata documents
└── finance/data/
    ├── transactions/{txId}       # Financial transactions
    └── subscriptions/{subId}     # Subscription tracking
```

## Document Schemas

### profile/settings
```typescript
{
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  focusSettings: {
    defaultFocus: number;       // minutes (default: 25)
    defaultBreak: number;       // minutes (default: 5)
    defaultLongBreak: number;   // minutes (default: 15)
    longBreakAfter: number;     // sessions (default: 4)
    autoStartNext: boolean;
    blocklist: string[];        // URLs to block during focus
    allowlist: string[];        // URLs to allow during focus
  }
}
```

### settings/integrations
```typescript
{
  // Google Calendar
  gcal_connected?: boolean;
  gcal_email?: string | null;
  gcal_connected_at?: string | null;    // ISO timestamp

  // Garmin Connect (per-user, never shared across accounts)
  garmin_connected?: boolean;
  garmin_display_name?: string | null;
  garmin_connected_at?: string | null;  // ISO timestamp
}
```

### tasks/{taskId}
```typescript
{
  title: string;
  area?: "health" | "career" | "finance" | "brand" | "admin";
  projectId?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "done" | "cancelled";
  dueDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### events/{eventId}
```typescript
{
  title: string;
  start: Timestamp;
  end: Timestamp;
  category?: string;
  source: "manual" | "gcal";
  notes?: string;
}
```

### notes/{noteId}
```typescript
{
  content: string;
  area?: AreaId;
  tags: string[];
  createdAt: Timestamp;
  processed: boolean;
}
```

### focusSessions/{sessionId}
```typescript
{
  startedAt: Timestamp;
  endedAt?: Timestamp;
  plannedDuration: number;    // minutes
  actualDuration?: number;    // minutes
  type: "focus" | "break" | "long_break";
  status: "completed" | "partial" | "abandoned";
  area?: AreaId;
  projectId?: string;
  questId?: string;
  taskId?: string;
  interruptions: number;
  blockId?: string;
  journeyId?: string;
}
```

### focusBlocks/{blockId}
```typescript
{
  title: string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:mm
  endTime: string;           // HH:mm
  area?: AreaId;
  projectId?: string;
  goal?: string;
  sessionCount: number;
  sessionDuration: number;   // minutes
  breakDuration: number;     // minutes
  bufferMinutes: number;
  autoStart: boolean;
  template?: string;
  sessionIds: string[];
  status: "scheduled" | "active" | "done";
}
```

### journeys/{journeyId}
```typescript
{
  title: string;
  area: AreaId;
  description?: string;
  totalHours: number;
  currentTier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  tierHistory: Array<{ tier: number; reachedAt: Timestamp }>;
  tags: string[];
  createdAt: Timestamp;
  isActive: boolean;
}
```

### quests/{questId}
```typescript
{
  title: string;
  category: "life" | "work";
  criteria: string;
  progress: number;          // 0-100
  startDate: Timestamp;
  endDate: Timestamp;
}
```

### goals/{goalId}
```typescript
{
  title: string;
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  status: "active" | "completed" | "abandoned";
  linkedQuestIds: string[];
  linkedProjectIds: string[];
}
```

### projects/{projectId}
```typescript
{
  title: string;
  area?: AreaId;
  status: "planning" | "active" | "paused" | "completed" | "archived";
  targetDate?: Timestamp;
  nextAction?: string;
  linkedTaskIds: string[];
  createdAt: Timestamp;
}
```

### habits/{habitId}
```typescript
{
  name: string;
  frequency: "daily" | "weekly";
  streak: number;
  history: Array<{ date: string; completed: boolean }>;
}
```

### dailyLogs/{YYYY-MM-DD}
```typescript
{
  sleepQuality?: number;     // 1-5
  energy?: number;           // 1-5
  mood?: number;             // 1-5
  gratitude?: string;
  reflection?: string;
  focusSessions: number;
  focusMinutes: number;
  streakDay: number;
}
```

### streaks/data
```typescript
{
  focus: {
    current: number;
    longest: number;
    lastActiveDate: string;  // YYYY-MM-DD
  };
  areas: {
    [areaId: string]: {
      current: number;
      longest: number;
      lastActiveDate: string;
    }
  };
  shieldDaysUsed: number;    // resets weekly
}
```

### finance/data/transactions/{txId}
```typescript
{
  amount: number;
  category: string;
  date: Timestamp;
  note?: string;
}
```

### finance/data/subscriptions/{subId}
```typescript
{
  name: string;
  cost: number;
  frequency: "monthly" | "yearly";
  renewalDate: Timestamp;
}
```

## Firestore Security Rules (Recommended)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures each user can only read/write their own data.
