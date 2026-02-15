// LifeOS Firestore Data Model Types

export type AreaId = "health" | "career" | "finance" | "brand" | "admin";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type FocusSessionType = "focus" | "break" | "long_break";
export type FocusSessionStatus = "completed" | "partial" | "abandoned";
export type FocusBlockStatus = "scheduled" | "active" | "done";

export type QuestCategory = "life" | "work";
export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";

export type JourneyTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TIER_NAMES: Record<JourneyTier, string> = {
  1: "Novice",
  2: "Apprentice",
  3: "Journeyman",
  4: "Adept",
  5: "Expert",
  6: "Master",
  7: "Grandmaster",
};

export const TIER_HOURS: Record<JourneyTier, number> = {
  1: 0,
  2: 100,
  3: 350,
  4: 850,
  5: 1850,
  6: 5000,
  7: 10000,
};

// --- Core Models ---

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Date;
  focusSettings: FocusSettings;
}

export interface FocusSettings {
  defaultFocus: number; // minutes
  defaultBreak: number;
  defaultLongBreak: number;
  longBreakAfter: number; // sessions
  autoStartNext: boolean;
  blocklist: string[];
  allowlist: string[];
}

export interface Task {
  id: string;
  title: string;
  area?: AreaId;
  projectId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  category?: string;
  source: "manual" | "gcal";
  notes?: string;
}

export interface Note {
  id: string;
  content: string;
  area?: AreaId;
  tags: string[];
  createdAt: Date;
  processed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  category: QuestCategory;
  criteria: string;
  progress: number; // 0-100
  startDate: Date;
  endDate: Date;
}

export interface Goal {
  id: string;
  title: string;
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  status: "active" | "completed" | "abandoned";
  linkedQuestIds: string[];
  linkedProjectIds: string[];
}

export interface Project {
  id: string;
  title: string;
  area?: AreaId;
  status: ProjectStatus;
  targetDate?: Date;
  nextAction?: string;
  linkedTaskIds: string[];
  createdAt: Date;
}

export interface Habit {
  id: string;
  name: string;
  frequency: "daily" | "weekly";
  streak: number;
  history: { date: string; completed: boolean }[];
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  sleepQuality?: number; // 1-5
  energy?: number; // 1-5
  mood?: number; // 1-5
  gratitude?: string;
  reflection?: string;
  focusSessions: number;
  focusMinutes: number;
  streakDay: number;
  tomorrowTop3?: string[];
}

export interface FocusSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  plannedDuration: number; // minutes
  actualDuration?: number;
  type: FocusSessionType;
  status: FocusSessionStatus;
  area?: AreaId;
  projectId?: string;
  questId?: string;
  taskId?: string;
  interruptions: number;
  blockId?: string;
  journeyId?: string;
}

export interface FocusBlock {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  area?: AreaId;
  projectId?: string;
  goal?: string;
  sessionCount: number;
  sessionDuration: number; // minutes
  breakDuration: number;
  bufferMinutes: number;
  autoStart: boolean;
  template?: string;
  sessionIds: string[];
  status: FocusBlockStatus;
}

export interface Journey {
  id: string;
  title: string;
  area: AreaId;
  description?: string;
  totalHours: number;
  currentTier: JourneyTier;
  tierHistory: { tier: JourneyTier; reachedAt: Date }[];
  tags: string[];
  createdAt: Date;
  isActive: boolean;
}

export interface Streaks {
  focus: StreakData;
  areas: Partial<Record<AreaId, StreakData>>;
  shieldDaysUsed: number;
}

export interface StreakData {
  current: number;
  longest: number;
  lastActiveDate: string; // YYYY-MM-DD
}

export interface Transaction {
  id: string;
  amount: number;
  category: string;
  date: Date;
  note?: string;
}

export interface Subscription {
  id: string;
  name: string;
  cost: number;
  frequency: "monthly" | "yearly";
  renewalDate: Date;
}

export interface Area {
  id: AreaId;
  name: string;
  description?: string;
  metrics: Record<string, number>;
  linkedProjectIds: string[];
  linkedTaskIds: string[];
}

// Area metadata for UI
export const AREAS: Record<AreaId, { name: string; color: string; icon: string }> = {
  health: { name: "Health & Training", color: "teal", icon: "Heart" },
  career: { name: "Career & Learning", color: "indigo", icon: "Briefcase" },
  finance: { name: "Finance", color: "amber", icon: "DollarSign" },
  brand: { name: "Personal Brand", color: "violet", icon: "Megaphone" },
  admin: { name: "Life Admin", color: "slate", icon: "ClipboardList" },
};
