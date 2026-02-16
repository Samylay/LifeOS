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

// --- Workout & Exercise Models ---

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "legs"
  | "core"
  | "cardio"
  | "flexibility"
  | "full_body";

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  isCustom: boolean;
}

export interface WorkoutSet {
  reps?: number;
  weight?: number; // kg
  duration?: number; // seconds (for timed exercises)
  distance?: number; // meters (for cardio)
}

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface Workout {
  id: string;
  title: string;
  date: Date;
  duration?: number; // minutes
  exercises: WorkoutExercise[];
  notes?: string;
  rating?: number; // 1-5 how the workout felt
  createdAt: Date;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: { exerciseId: string; exerciseName: string; targetSets: number }[];
}

// --- Reminders / Recurring Tasks ---

export type ReminderFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly";

export interface Reminder {
  id: string;
  title: string;
  notes?: string;
  frequency: ReminderFrequency;
  time?: string; // HH:mm
  dueDate: Date;
  area?: AreaId;
  completed: boolean;
  lastCompletedDate?: string; // YYYY-MM-DD
  createdAt: Date;
}

// --- Water Intake ---

export interface WaterLog {
  date: string; // YYYY-MM-DD
  glasses: number; // each glass = 250ml
  goal: number; // target glasses per day
  entries: { time: string; amount: number }[]; // individual entries
}

// --- Reading / Book Tracker ---

export type BookStatus = "want_to_read" | "reading" | "finished" | "abandoned";

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  totalPages?: number;
  currentPage?: number;
  rating?: number; // 1-5
  notes?: string;
  startDate?: Date;
  finishDate?: Date;
  createdAt: Date;
}

// --- Body Measurements ---

export interface BodyMeasurement {
  id: string;
  date: Date;
  weight?: number; // kg
  bodyFat?: number; // percentage
  chest?: number; // cm
  waist?: number;
  hips?: number;
  biceps?: number;
  thighs?: number;
}

// --- Default Exercises Library ---

export const DEFAULT_EXERCISES: Exercise[] = [
  // Chest
  { id: "bench-press", name: "Bench Press", muscleGroup: "chest", isCustom: false },
  { id: "push-ups", name: "Push-ups", muscleGroup: "chest", isCustom: false },
  { id: "dumbbell-fly", name: "Dumbbell Fly", muscleGroup: "chest", isCustom: false },
  { id: "incline-press", name: "Incline Press", muscleGroup: "chest", isCustom: false },
  // Back
  { id: "pull-ups", name: "Pull-ups", muscleGroup: "back", isCustom: false },
  { id: "barbell-row", name: "Barbell Row", muscleGroup: "back", isCustom: false },
  { id: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "back", isCustom: false },
  { id: "deadlift", name: "Deadlift", muscleGroup: "back", isCustom: false },
  // Shoulders
  { id: "overhead-press", name: "Overhead Press", muscleGroup: "shoulders", isCustom: false },
  { id: "lateral-raise", name: "Lateral Raise", muscleGroup: "shoulders", isCustom: false },
  { id: "face-pull", name: "Face Pull", muscleGroup: "shoulders", isCustom: false },
  // Arms
  { id: "bicep-curl", name: "Bicep Curl", muscleGroup: "biceps", isCustom: false },
  { id: "tricep-dips", name: "Tricep Dips", muscleGroup: "triceps", isCustom: false },
  { id: "hammer-curl", name: "Hammer Curl", muscleGroup: "biceps", isCustom: false },
  // Legs
  { id: "squat", name: "Squat", muscleGroup: "legs", isCustom: false },
  { id: "leg-press", name: "Leg Press", muscleGroup: "legs", isCustom: false },
  { id: "lunges", name: "Lunges", muscleGroup: "legs", isCustom: false },
  { id: "calf-raises", name: "Calf Raises", muscleGroup: "legs", isCustom: false },
  { id: "romanian-deadlift", name: "Romanian Deadlift", muscleGroup: "legs", isCustom: false },
  // Core
  { id: "plank", name: "Plank", muscleGroup: "core", isCustom: false },
  { id: "crunches", name: "Crunches", muscleGroup: "core", isCustom: false },
  { id: "leg-raises", name: "Leg Raises", muscleGroup: "core", isCustom: false },
  { id: "russian-twist", name: "Russian Twist", muscleGroup: "core", isCustom: false },
  // Cardio
  { id: "running", name: "Running", muscleGroup: "cardio", isCustom: false },
  { id: "cycling", name: "Cycling", muscleGroup: "cardio", isCustom: false },
  { id: "jump-rope", name: "Jump Rope", muscleGroup: "cardio", isCustom: false },
  { id: "rowing", name: "Rowing", muscleGroup: "cardio", isCustom: false },
  // Flexibility
  { id: "stretching", name: "Stretching", muscleGroup: "flexibility", isCustom: false },
  { id: "yoga", name: "Yoga", muscleGroup: "flexibility", isCustom: false },
];

// --- Garmin Connect Types ---

export interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: string; // e.g. "running", "cycling", "strength_training"
  startTimeLocal: string;
  duration: number; // seconds
  distance: number; // meters
  calories: number;
  averageHR: number;
  maxHR: number;
  elevationGain: number;
  steps: number;
  vO2MaxValue: number;
  averageSpeed: number; // m/s
}

export interface GarminSleepData {
  calendarDate: string;
  sleepTimeSeconds: number;
  deepSleepSeconds: number;
  lightSleepSeconds: number;
  remSleepSeconds: number;
  awakeSleepSeconds: number;
  sleepScore: number; // overall score
  restingHeartRate: number;
  avgOvernightHrv: number;
  hrvStatus: string;
  bodyBatteryChange: number;
  averageRespirationValue: number;
}

export interface GarminHeartRate {
  calendarDate: string;
  maxHeartRate: number;
  minHeartRate: number;
  restingHeartRate: number;
  lastSevenDaysAvgRestingHeartRate: number;
}

export interface GarminDailySummary {
  calendarDate: string;
  steps: number;
  heartRate: GarminHeartRate | null;
  sleep: GarminSleepData | null;
}

export interface GarminConnectionState {
  connected: boolean;
  displayName: string | null;
  lastSyncedAt: string | null;
}

// Area metadata for UI
export const AREAS: Record<AreaId, { name: string; color: string; icon: string }> = {
  health: { name: "Health & Training", color: "teal", icon: "Heart" },
  career: { name: "Career & Learning", color: "indigo", icon: "Briefcase" },
  finance: { name: "Finance", color: "amber", icon: "DollarSign" },
  brand: { name: "Personal Brand", color: "violet", icon: "Megaphone" },
  admin: { name: "Life Admin", color: "slate", icon: "ClipboardList" },
};
