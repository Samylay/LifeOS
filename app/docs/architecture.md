# LifeOS App — Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| State | Zustand | 5.x |
| Database | Firebase Firestore | 12.x |
| Auth | Firebase Auth (Google) | 12.x |
| Charts | Recharts | 3.x |
| Icons | Lucide React | 0.564.x |
| Fonts | Inter + JetBrains Mono | via @fontsource |

## Project Structure

```
app/
├── docs/                    # Documentation (you are here)
├── public/                  # Static assets
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # Dashboard (Command Center)
│   │   ├── layout.tsx       # Root layout
│   │   ├── providers.tsx    # Client providers (Auth, AppShell)
│   │   ├── globals.css      # Design tokens + theme system
│   │   ├── focus/           # Focus timer, blocks, analytics
│   │   ├── areas/           # Life area modules (health, career, etc.)
│   │   ├── projects/        # Project tracker
│   │   ├── quests/          # Quest tracker
│   │   ├── journeys/        # Hero Journey dashboard
│   │   ├── calendar/        # Calendar view
│   │   ├── goals/           # Annual goals
│   │   ├── review/          # Weekly/monthly review
│   │   ├── capture/         # Full capture interface
│   │   └── settings/        # Profile, integrations, focus settings
│   ├── components/          # Shared UI components
│   │   ├── app-shell.tsx    # Layout wrapper (sidebar + topbar + auth gate)
│   │   ├── sidebar.tsx      # Collapsible sidebar navigation
│   │   ├── top-bar.tsx      # Top bar with quick capture
│   │   ├── login-screen.tsx # Google sign-in screen
│   │   ├── task-list.tsx    # TaskList, TaskItem, TaskCreateForm
│   │   └── daily-log.tsx    # MorningCheckIn, EveningReflection
│   └── lib/                 # Business logic, hooks, Firebase
│       ├── firebase.ts      # Firebase initialization (conditional)
│       ├── firestore.ts     # Firestore CRUD helpers for all collections
│       ├── auth-context.tsx  # AuthProvider + useAuth hook
│       ├── store.ts         # Zustand UI state (sidebar)
│       ├── types.ts         # Full Firestore data model types
│       ├── use-tasks.ts     # Task CRUD hook with real-time sync
│       ├── use-focus.ts     # Focus timer state machine + session logging
│       ├── use-daily-log.ts # Daily log read/write hook
│       └── use-streaks.ts   # Focus streak tracking hook
├── .env.local.example       # Environment variable template
├── package.json
├── tsconfig.json
└── next.config.ts
```

## Data Flow

```
User Action → React Component → Custom Hook → Firestore SDK → Firebase
                                     ↓
                               onSnapshot listener
                                     ↓
                              React state update → UI re-render
```

All data operations go through custom hooks (`useTasks`, `useFocusTimer`, etc.) which:
1. Set up real-time Firestore listeners via `onSnapshot`
2. Provide CRUD functions that write to Firestore
3. Fall back to local React state when Firebase is not configured (demo mode)

## Authentication Flow

1. App loads → `AuthProvider` checks Firebase config
2. If configured: `onAuthStateChanged` listener waits for auth state
3. If user is null → `LoginScreen` with Google sign-in button
4. If Firebase not configured → demo mode (skip auth, show app directly)
5. Authenticated user's UID is used as the Firestore path prefix: `users/{uid}/...`

## Theme System

The app uses CSS custom properties for theming:
- Light theme: default (`:root`)
- Dark theme: `.dark` class or `prefers-color-scheme: dark` media query
- Components reference semantic tokens like `var(--bg-primary)`, `var(--accent)`, etc.
- See `globals.css` for the full token map
