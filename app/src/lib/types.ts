// Stride Firestore Data Model Types

export type AreaId = "health" | "career" | "finance" | "brand" | "admin";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";

// --- Core Models ---

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Date;
}

export type EnergyLevel = 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  description?: string;
  area?: AreaId;
  projectId?: string;
  parentId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  energy?: EnergyLevel;
  estimatedMinutes?: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note {
  id: string;
  content: string;
  area?: AreaId;
  tags: string[];
  createdAt: Date;
  processed: boolean;
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
  tomorrowTop3?: string[];
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

// --- Strength (build-then-maintain) ---
//
// Sequential emphasis, parallel maintenance: one focus is in "building" at a
// time (front-loaded dose for a fixed window), everything already built ticks
// over on a cheap "maintaining" dose, and the rest sit "queued". Graduating a
// focus flips it to maintaining and promotes the next queued one to building.

export type StrengthState = "building" | "maintaining" | "queued";

export interface StrengthFocus {
  id: string;
  label: string; // "Core & Balance"
  state: StrengthState;
  order: number; // queue position (asc)
  buildWeeks: number; // length of the build window, weeks
  buildStarted?: Date; // set when the focus enters "building"
  buildTargetFreq: number; // target sessions/week while building
  maintainFreq: number; // sessions/week once maintaining
  exercises: string[]; // editable prescription (one line each)
  note?: string;
  log: { date: Date }[]; // logged sessions, newest last
  createdAt: Date;
  updatedAt: Date;
}

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  const day = (s.getDay() + 6) % 7; // Monday = 0
  s.setDate(s.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** Current build week (1-indexed) for a focus that has started building. */
export function weekOfBuild(focus: StrengthFocus, now: Date = new Date()): number {
  if (!focus.buildStarted) return 0;
  const started = new Date(focus.buildStarted);
  const ms = now.getTime() - started.getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1);
}

/** Sessions logged since the most recent Monday. */
export function sessionsThisWeek(focus: StrengthFocus, now: Date = new Date()): number {
  const weekStart = startOfWeek(now);
  return focus.log.filter((e) => new Date(e.date) >= weekStart).length;
}

/** True once the build window has fully elapsed (ready to graduate). */
export function buildComplete(focus: StrengthFocus, now: Date = new Date()): boolean {
  return focus.state === "building" && weekOfBuild(focus, now) > focus.buildWeeks;
}

/** Target sessions/week for the focus given its current state. */
export function targetFreq(focus: StrengthFocus): number {
  return focus.state === "building" ? focus.buildTargetFreq : focus.maintainFreq;
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

// --- Ingredient categories (used by recipes) ---

export type ShoppingCategory =
  | "groceries"
  | "household"
  | "personal_care"
  | "snacks"
  | "beverages"
  | "frozen"
  | "other";

export const SHOPPING_CATEGORIES: Record<ShoppingCategory, { label: string; color: string }> = {
  groceries: { label: "Groceries", color: "#22C55E" },
  household: { label: "Household", color: "#6366F1" },
  personal_care: { label: "Personal Care", color: "#EC4899" },
  snacks: { label: "Snacks", color: "#F59E0B" },
  beverages: { label: "Beverages", color: "#06B6D4" },
  frozen: { label: "Frozen", color: "#8B5CF6" },
  other: { label: "Other", color: "#64748B" },
};

// --- Recipes & Meal Plan ---

export interface RecipeIngredient {
  name: string;
  quantity?: string;
  category?: ShoppingCategory;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  steps?: string[];
  tags?: string[];
  servings?: number;
  prepMinutes?: number;
  notes?: string;
  createdAt: Date;
}

export type MealDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type MealSlot = "lunch" | "dinner";

export interface MealPlanEntry {
  recipeId?: string;
  recipeName?: string; // free-text if no recipe linked
  text?: string; // free-text note instead of a recipe
}

export interface MealPlan {
  id: string; // week identifier, e.g. ISO date of Monday "YYYY-MM-DD"
  weekOf: string; // YYYY-MM-DD (Monday)
  meals: Partial<Record<MealDay, Partial<Record<MealSlot, MealPlanEntry>>>>;
  updatedAt: Date;
}

export const MEAL_DAYS: MealDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const MEAL_DAY_LABELS: Record<MealDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
export const MEAL_SLOTS: MealSlot[] = ["lunch", "dinner"];

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

// --- Goals (quarterly objective → weekly commitments → sessions) ---
//
// A goal is a single quarterly objective. Each ISO week you set 1-3 concrete
// commitments toward it (the week-to-week layer), and log sessions as you put
// in the work (the day-to-day layer). The weekly plan can be AI-prefilled from
// the objective via `claude -p`.

export type GoalStatus = "active" | "done" | "dropped";

export interface GoalCommitment {
  id: string;
  text: string;
  weekOf: string; // ISO Monday, YYYY-MM-DD
  done: boolean;
}

export interface GoalSession {
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface Goal {
  id: string;
  title: string;
  quarter: string; // e.g. "2026-Q3"
  why?: string;
  outcome?: string; // definition of done
  status: GoalStatus;
  milestones: string[]; // AI/user quarter-level steps, for reference
  commitments: GoalCommitment[];
  sessions: GoalSession[];
  createdAt: Date;
  updatedAt: Date;
}

/** Quarter key for a date, e.g. "2026-Q3". */
export function quarterOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/** ISO Monday (YYYY-MM-DD) for the week containing `d`. */
export function mondayOf(d: Date = new Date()): string {
  const m = new Date(d);
  const day = (m.getDay() + 6) % 7; // Monday = 0
  m.setDate(m.getDate() - day);
  m.setHours(0, 0, 0, 0);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

/** Commitments for the current week. */
export function commitmentsForWeek(goal: Goal, weekOf: string): GoalCommitment[] {
  return goal.commitments.filter((c) => c.weekOf === weekOf);
}

/** Sessions logged since the most recent Monday. */
export function sessionsThisWeekForGoal(goal: Goal, weekOf: string): number {
  return goal.sessions.filter((s) => s.date >= weekOf).length;
}

// --- Daily Prime (morning priming ritual) ---
//
// Two stacked steps run each morning: read-aloud affirmations, and one spoken
// journaling prompt under a soft timer. The affirmation/prompt content lives
// in editable banks; each morning composes a `PrimeDay` from them and
// persists acknowledgements.

export type AffirmationType = "anchor" | "rotating" | "contextual";

export interface Affirmation {
  id: string;
  text: string;
  type: AffirmationType; // anchors show most days; rotating/contextual swap in
  active: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PromptCategory = "concrete" | "abstract";

export interface PrimePrompt {
  id: string;
  text: string;
  category: PromptCategory; // concrete leads; abstract mixed in later
  weight: number; // how often it rotates in (relative)
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Principle {
  id: string;
  text: string; // standing principle, e.g. "Prayers are rituals."
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// A single morning's record. id = the date string (YYYY-MM-DD).
export interface PrimeDay {
  date: string; // YYYY-MM-DD
  affirmations: {
    id: string;
    text: string;
    type: AffirmationType;
    acknowledged: boolean;
  }[];
  principleOfDay?: string; // optional standing-principle slot for the day
  prompt: { id: string; text: string; category: PromptCategory };
  promptAcknowledged: boolean;
  completedAt?: Date; // set once every step is acknowledged
  createdAt: Date;
  updatedAt: Date;
}

export interface PrimeSettings {
  // Soft-timer floor in seconds — a target to reach, not a countdown. Raise
  // over time (60 → 90 → 120) as fluency builds.
  timerFloorSec: number;
}

export const PRIME_TIMER_FLOORS = [60, 90, 120] as const;
export const DEFAULT_PRIME_SETTINGS: PrimeSettings = { timerFloorSec: 60 };

/** Local date as YYYY-MM-DD (used as the PrimeDay id). */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Things to Learn ---
//
// A deliberately minimal learning backlog: topics parked until there's time.
// Only these fields — intentionally no "teach"/"content" field.

export type LearnStatus = "parked" | "learning" | "learned";

export interface LearnItem {
  id: string;
  topic: string;
  why: string; // what pulled you toward it
  firstStep?: string; // smallest concrete entry point
  status: LearnStatus;
  createdAt: Date;
  updatedAt: Date;
}

// --- Content OS ---
//
// Operational layer for the content system documented in the Obsidian vault
// (01-Inbox/content-os/). The vault holds the playbook (brand, strategy,
// SOP); these types hold the two things that change weekly: the idea bank
// and the post tracker.

export type ContentPillar = "build-log" | "workflow-win" | "under-the-hood";

// Production pipeline, matching the weekly batch SOP (script Mon → record
// Tue → edit Wed → publish Thu–Sun).
export type ContentIdeaStatus = "idea" | "scripted" | "recorded" | "edited" | "posted";

export interface ContentIdea {
  id: string;
  title: string;
  pillar: ContentPillar;
  hookFormula?: number; // 1–12 from the hook library; unset = topic, not script-ready
  episode?: number; // Build Log serial number
  notes?: string;
  status: ContentIdeaStatus;
  createdAt: Date;
  updatedAt: Date;
}

// One row of the Friday analytics review. Metrics are optional so a post can
// be logged on publish day and filled in on Friday.
export interface ContentPost {
  id: string;
  date: string; // YYYY-MM-DD posted
  title: string;
  pillar: ContentPillar;
  hookFormula?: number;
  retention3s?: number; // % still watching at 3s
  completion?: number; // % completion rate
  sendsPerReach?: number; // sends per 1000 reached
  savesPerReach?: number; // saves per 1000 reached
  follows?: number; // follows attributed to the post
  note?: string; // the forced one-sentence diagnosis
  createdAt: Date;
  updatedAt: Date;
}


