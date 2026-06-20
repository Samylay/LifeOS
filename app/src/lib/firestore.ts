// CRUD helpers for every collection — same surface as before, but backed by
// the local `/api/data` store instead of the Firestore SDK. Data is keyed by
// `users/<userId>/<collection>` exactly as it was in Firestore.
import {
  where,
  orderBy,
  serializeDates,
  reviveDates,
  buildQueryString,
  type QueryConstraint,
} from "./local-db";
import type {
  Task,
  CalendarEvent,
  Note,
  Goal,
  Project,
  Habit,
  DailyLog,
  UserProfile,
  Transaction,
  Subscription,
  Area,
  Workout,
  WorkoutTemplate,
  Reminder,
  BodyMeasurement,
  Recipe,
  MealPlan,
  StrengthFocus,
  Affirmation,
  PrimePrompt,
  Principle,
  PrimeDay,
  PrimeSettings,
  WeekendProject,
  LearnItem,
} from "./types";

export type { QueryConstraint };

// --- Transport ---------------------------------------------------------------

function userPath(userId: string, collectionPath: string): string {
  return `users/${userId}/${collectionPath}`;
}

async function apiGetCollection<T>(
  fullPath: string,
  constraints: QueryConstraint[]
): Promise<T[]> {
  const res = await fetch(`/api/data/${fullPath}${buildQueryString(constraints)}`);
  if (!res.ok) return [];
  const { docs } = await res.json();
  return (docs as Record<string, unknown>[]).map((d) => reviveDates(d) as T);
}

async function apiGetDoc<T>(fullPath: string): Promise<T | null> {
  const res = await fetch(`/api/data/${fullPath}`);
  if (!res.ok) return null;
  const { doc } = await res.json();
  return doc ? (reviveDates(doc) as T) : null;
}

async function apiCreate(fullPath: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`/api/data/${fullPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeDates(data)),
  });
  const { id } = await res.json();
  return id as string;
}

async function apiUpdate(fullPath: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`/api/data/${fullPath}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeDates(data)),
  });
}

async function apiSet(
  fullPath: string,
  data: Record<string, unknown>,
  merge = true
): Promise<void> {
  await fetch(`/api/data/${fullPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: serializeDates(data), merge }),
  });
}

async function apiDelete(fullPath: string): Promise<void> {
  await fetch(`/api/data/${fullPath}`, { method: "DELETE" });
}

// --- Generic CRUD ---

function createDocument<T extends { id?: string }>(
  userId: string,
  collectionPath: string,
  data: Omit<T, "id">
): Promise<string> {
  return apiCreate(userPath(userId, collectionPath), data as Record<string, unknown>);
}

function getDocument<T>(
  userId: string,
  collectionPath: string,
  docId: string
): Promise<T | null> {
  return apiGetDoc<T>(`${userPath(userId, collectionPath)}/${docId}`);
}

function updateDocument(
  userId: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  return apiUpdate(`${userPath(userId, collectionPath)}/${docId}`, data);
}

function deleteDocument(
  userId: string,
  collectionPath: string,
  docId: string
): Promise<void> {
  return apiDelete(`${userPath(userId, collectionPath)}/${docId}`);
}

function queryDocuments<T>(
  userId: string,
  collectionPath: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  return apiGetCollection<T>(userPath(userId, collectionPath), constraints);
}

// --- Profile ---

export async function getProfile(userId: string): Promise<UserProfile | null> {
  return getDocument<UserProfile>(userId, "profile", "settings");
}

export async function setProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  await apiSet(`${userPath(userId, "profile")}/settings`, data as Record<string, unknown>);
}

// --- Tasks ---

export const tasks = {
  create: (userId: string, data: Omit<Task, "id">) =>
    createDocument<Task>(userId, "tasks", data),
  get: (userId: string, id: string) => getDocument<Task>(userId, "tasks", id),
  update: (userId: string, id: string, data: Partial<Task>) =>
    updateDocument(userId, "tasks", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "tasks", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Task>(userId, "tasks", ...constraints),
  listByArea: (userId: string, area: string) =>
    queryDocuments<Task>(userId, "tasks", where("area", "==", area)),
  listActive: (userId: string) =>
    queryDocuments<Task>(userId, "tasks", where("status", "in", ["todo", "in_progress"]), orderBy("priority")),
};

// --- Events ---

export const events = {
  create: (userId: string, data: Omit<CalendarEvent, "id">) =>
    createDocument<CalendarEvent>(userId, "events", data),
  get: (userId: string, id: string) => getDocument<CalendarEvent>(userId, "events", id),
  update: (userId: string, id: string, data: Partial<CalendarEvent>) =>
    updateDocument(userId, "events", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "events", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<CalendarEvent>(userId, "events", ...constraints),
};

// --- Notes ---

export const notes = {
  create: (userId: string, data: Omit<Note, "id">) =>
    createDocument<Note>(userId, "notes", data),
  get: (userId: string, id: string) => getDocument<Note>(userId, "notes", id),
  update: (userId: string, id: string, data: Partial<Note>) =>
    updateDocument(userId, "notes", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "notes", id),
  listUnprocessed: (userId: string) =>
    queryDocuments<Note>(userId, "notes", where("processed", "==", false), orderBy("createdAt", "desc")),
};

// --- Goals (quarterly objectives). Stored as "objectives" to avoid clashing
// with any legacy "goals" docs from the removed year-goal feature. ---

export const goals = {
  create: (userId: string, data: Omit<Goal, "id">) =>
    createDocument<Goal>(userId, "objectives", data),
  get: (userId: string, id: string) => getDocument<Goal>(userId, "objectives", id),
  update: (userId: string, id: string, data: Partial<Goal>) =>
    updateDocument(userId, "objectives", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "objectives", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Goal>(userId, "objectives", ...constraints),
};

// --- Projects ---

export const projects = {
  create: (userId: string, data: Omit<Project, "id">) =>
    createDocument<Project>(userId, "projects", data),
  get: (userId: string, id: string) => getDocument<Project>(userId, "projects", id),
  update: (userId: string, id: string, data: Partial<Project>) =>
    updateDocument(userId, "projects", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "projects", id),
  listActive: (userId: string) =>
    queryDocuments<Project>(userId, "projects", where("status", "in", ["planning", "active"])),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Project>(userId, "projects", ...constraints),
};

// --- Habits ---

export const habits = {
  create: (userId: string, data: Omit<Habit, "id">) =>
    createDocument<Habit>(userId, "habits", data),
  get: (userId: string, id: string) => getDocument<Habit>(userId, "habits", id),
  update: (userId: string, id: string, data: Partial<Habit>) =>
    updateDocument(userId, "habits", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "habits", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Habit>(userId, "habits", ...constraints),
};

// --- Daily Logs ---

export const dailyLogs = {
  get: (userId: string, date: string) => getDocument<DailyLog>(userId, "dailyLogs", date),
  set: (userId: string, date: string, data: Partial<DailyLog>) =>
    apiSet(`${userPath(userId, "dailyLogs")}/${date}`, data as Record<string, unknown>),
};

// --- Finance ---

export const finance = {
  transactions: {
    create: (userId: string, data: Omit<Transaction, "id">) =>
      createDocument<Transaction>(userId, "finance/data/transactions", data),
    list: (userId: string, ...constraints: QueryConstraint[]) =>
      queryDocuments<Transaction>(userId, "finance/data/transactions", ...constraints),
  },
  subscriptions: {
    create: (userId: string, data: Omit<Subscription, "id">) =>
      createDocument<Subscription>(userId, "finance/data/subscriptions", data),
    list: (userId: string, ...constraints: QueryConstraint[]) =>
      queryDocuments<Subscription>(userId, "finance/data/subscriptions", ...constraints),
    update: (userId: string, id: string, data: Partial<Subscription>) =>
      updateDocument(userId, "finance/data/subscriptions", id, data),
    delete: (userId: string, id: string) =>
      deleteDocument(userId, "finance/data/subscriptions", id),
  },
};

// --- Areas ---

export const areas = {
  get: (userId: string, areaId: string) => getDocument<Area>(userId, "areas", areaId),
  set: (userId: string, areaId: string, data: Partial<Area>) =>
    apiSet(`${userPath(userId, "areas")}/${areaId}`, data as Record<string, unknown>),
  list: (userId: string) => queryDocuments<Area>(userId, "areas"),
};

// --- Workouts ---

export const workouts = {
  create: (userId: string, data: Omit<Workout, "id">) =>
    createDocument<Workout>(userId, "workouts", data),
  get: (userId: string, id: string) => getDocument<Workout>(userId, "workouts", id),
  update: (userId: string, id: string, data: Partial<Workout>) =>
    updateDocument(userId, "workouts", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "workouts", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Workout>(userId, "workouts", ...constraints),
};

// --- Workout Templates ---

export const workoutTemplates = {
  create: (userId: string, data: Omit<WorkoutTemplate, "id">) =>
    createDocument<WorkoutTemplate>(userId, "workoutTemplates", data),
  get: (userId: string, id: string) => getDocument<WorkoutTemplate>(userId, "workoutTemplates", id),
  update: (userId: string, id: string, data: Partial<WorkoutTemplate>) =>
    updateDocument(userId, "workoutTemplates", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "workoutTemplates", id),
  list: (userId: string) => queryDocuments<WorkoutTemplate>(userId, "workoutTemplates"),
};

// --- Reminders ---

export const reminders = {
  create: (userId: string, data: Omit<Reminder, "id">) =>
    createDocument<Reminder>(userId, "reminders", data),
  get: (userId: string, id: string) => getDocument<Reminder>(userId, "reminders", id),
  update: (userId: string, id: string, data: Partial<Reminder>) =>
    updateDocument(userId, "reminders", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "reminders", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Reminder>(userId, "reminders", ...constraints),
};

// --- Body Measurements ---

export const bodyMeasurements = {
  create: (userId: string, data: Omit<BodyMeasurement, "id">) =>
    createDocument<BodyMeasurement>(userId, "bodyMeasurements", data),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<BodyMeasurement>(userId, "bodyMeasurements", ...constraints),
  delete: (userId: string, id: string) => deleteDocument(userId, "bodyMeasurements", id),
};



// --- Recipes ---

export const recipes = {
  create: (userId: string, data: Omit<Recipe, "id">) =>
    createDocument<Recipe>(userId, "recipes", data),
  get: (userId: string, id: string) => getDocument<Recipe>(userId, "recipes", id),
  update: (userId: string, id: string, data: Partial<Recipe>) =>
    updateDocument(userId, "recipes", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "recipes", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Recipe>(userId, "recipes", ...constraints),
};

// --- Meal Plan ---

export const mealPlans = {
  get: (userId: string, weekId: string) => getDocument<MealPlan>(userId, "mealplan", weekId),
  set: (userId: string, weekId: string, data: Partial<MealPlan>) =>
    apiSet(`${userPath(userId, "mealplan")}/${weekId}`, data as Record<string, unknown>),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<MealPlan>(userId, "mealplan", ...constraints),
};

// --- Strength focuses ---

export const strengthFocuses = {
  create: (userId: string, data: Omit<StrengthFocus, "id">) =>
    createDocument<StrengthFocus>(userId, "strengthFocuses", data),
  get: (userId: string, id: string) => getDocument<StrengthFocus>(userId, "strengthFocuses", id),
  update: (userId: string, id: string, data: Partial<StrengthFocus>) =>
    updateDocument(userId, "strengthFocuses", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "strengthFocuses", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<StrengthFocus>(userId, "strengthFocuses", ...constraints),
};

// --- Daily Prime: affirmation bank ---

export const affirmations = {
  create: (userId: string, data: Omit<Affirmation, "id">) =>
    createDocument<Affirmation>(userId, "affirmationBank", data),
  update: (userId: string, id: string, data: Partial<Affirmation>) =>
    updateDocument(userId, "affirmationBank", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "affirmationBank", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Affirmation>(userId, "affirmationBank", ...constraints),
};

// --- Daily Prime: journaling prompt bank ---

export const primePrompts = {
  create: (userId: string, data: Omit<PrimePrompt, "id">) =>
    createDocument<PrimePrompt>(userId, "promptBank", data),
  update: (userId: string, id: string, data: Partial<PrimePrompt>) =>
    updateDocument(userId, "promptBank", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "promptBank", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<PrimePrompt>(userId, "promptBank", ...constraints),
};

// --- Daily Prime: standing principles ---

export const principles = {
  create: (userId: string, data: Omit<Principle, "id">) =>
    createDocument<Principle>(userId, "principles", data),
  update: (userId: string, id: string, data: Partial<Principle>) =>
    updateDocument(userId, "principles", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "principles", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Principle>(userId, "principles", ...constraints),
};

// --- Daily Prime: per-day records (id = YYYY-MM-DD) + settings ---

export const primeDays = {
  get: (userId: string, date: string) => getDocument<PrimeDay>(userId, "primeDays", date),
  set: (userId: string, date: string, data: Partial<PrimeDay>) =>
    apiSet(`${userPath(userId, "primeDays")}/${date}`, data as Record<string, unknown>),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<PrimeDay>(userId, "primeDays", ...constraints),
};

export const primeSettings = {
  get: (userId: string) => getDocument<PrimeSettings>(userId, "prime", "settings"),
  set: (userId: string, data: Partial<PrimeSettings>) =>
    apiSet(`${userPath(userId, "prime")}/settings`, data as Record<string, unknown>),
};

// --- Weekend Projects ---

export const weekendProjects = {
  create: (userId: string, data: Omit<WeekendProject, "id">) =>
    createDocument<WeekendProject>(userId, "weekendProjects", data),
  get: (userId: string, id: string) => getDocument<WeekendProject>(userId, "weekendProjects", id),
  update: (userId: string, id: string, data: Partial<WeekendProject>) =>
    updateDocument(userId, "weekendProjects", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "weekendProjects", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<WeekendProject>(userId, "weekendProjects", ...constraints),
};

// --- Things to Learn ---

export const learnItems = {
  create: (userId: string, data: Omit<LearnItem, "id">) =>
    createDocument<LearnItem>(userId, "learnItems", data),
  get: (userId: string, id: string) => getDocument<LearnItem>(userId, "learnItems", id),
  update: (userId: string, id: string, data: Partial<LearnItem>) =>
    updateDocument(userId, "learnItems", id, data),
  delete: (userId: string, id: string) => deleteDocument(userId, "learnItems", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<LearnItem>(userId, "learnItems", ...constraints),
};
