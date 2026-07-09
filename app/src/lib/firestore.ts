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
  DailyLog,
  MealPlan,
  Affirmation,
  PrimePrompt,
  Principle,
  PrimeDay,
  PrimeSettings,
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

// --- Generic CRUD (also consumed by the useCollection hook factory) ---

export function createDocument<T extends { id?: string }>(
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

export function updateDocument(
  userId: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  return apiUpdate(`${userPath(userId, collectionPath)}/${docId}`, data);
}

export function deleteDocument(
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

// --- Daily Logs ---

export const dailyLogs = {
  get: (userId: string, date: string) => getDocument<DailyLog>(userId, "dailyLogs", date),
  set: (userId: string, date: string, data: Partial<DailyLog>) =>
    apiSet(`${userPath(userId, "dailyLogs")}/${date}`, data as Record<string, unknown>),
};

// --- Meal Plan ---

export const mealPlans = {
  get: (userId: string, weekId: string) => getDocument<MealPlan>(userId, "mealplan", weekId),
  set: (userId: string, weekId: string, data: Partial<MealPlan>) =>
    apiSet(`${userPath(userId, "mealplan")}/${weekId}`, data as Record<string, unknown>),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<MealPlan>(userId, "mealplan", ...constraints),
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
