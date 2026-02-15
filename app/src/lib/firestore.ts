import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentData,
  QueryConstraint,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

function getDb() {
  if (!db) throw new Error("Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
  return db;
}
import type {
  Task,
  CalendarEvent,
  Note,
  Quest,
  Goal,
  Project,
  Habit,
  DailyLog,
  FocusSession,
  FocusBlock,
  Journey,
  Streaks,
  UserProfile,
  Transaction,
  Subscription,
  Area,
} from "./types";

// --- Helpers ---

function userCollection(userId: string, path: string) {
  return collection(getDb(), `users/${userId}/${path}`);
}

function userDoc(userId: string, path: string, docId: string) {
  return doc(getDb(), `users/${userId}/${path}`, docId);
}

function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  return timestamp;
}

function toFirestoreData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = Timestamp.fromDate(value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// --- Generic CRUD ---

async function createDocument<T extends { id?: string }>(
  userId: string,
  collectionPath: string,
  data: Omit<T, "id">
): Promise<string> {
  const ref = await addDoc(
    userCollection(userId, collectionPath),
    toFirestoreData(data as Record<string, unknown>)
  );
  return ref.id;
}

async function getDocument<T>(
  userId: string,
  collectionPath: string,
  docId: string
): Promise<T | null> {
  const snap = await getDoc(userDoc(userId, collectionPath, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

async function updateDocument(
  userId: string,
  collectionPath: string,
  docId: string,
  data: Partial<DocumentData>
): Promise<void> {
  await updateDoc(
    userDoc(userId, collectionPath, docId),
    toFirestoreData(data as Record<string, unknown>)
  );
}

async function deleteDocument(
  userId: string,
  collectionPath: string,
  docId: string
): Promise<void> {
  await deleteDoc(userDoc(userId, collectionPath, docId));
}

async function queryDocuments<T>(
  userId: string,
  collectionPath: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(userCollection(userId, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

// --- Profile ---

export async function getProfile(userId: string): Promise<UserProfile | null> {
  return getDocument<UserProfile>(userId, "profile", "settings");
}

export async function setProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  await setDoc(
    userDoc(userId, "profile", "settings"),
    toFirestoreData(data as Record<string, unknown>),
    { merge: true }
  );
}

// --- Tasks ---

export const tasks = {
  create: (userId: string, data: Omit<Task, "id">) =>
    createDocument<Task>(userId, "tasks", data),
  get: (userId: string, id: string) =>
    getDocument<Task>(userId, "tasks", id),
  update: (userId: string, id: string, data: Partial<Task>) =>
    updateDocument(userId, "tasks", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "tasks", id),
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
  get: (userId: string, id: string) =>
    getDocument<CalendarEvent>(userId, "events", id),
  update: (userId: string, id: string, data: Partial<CalendarEvent>) =>
    updateDocument(userId, "events", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "events", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<CalendarEvent>(userId, "events", ...constraints),
};

// --- Notes ---

export const notes = {
  create: (userId: string, data: Omit<Note, "id">) =>
    createDocument<Note>(userId, "notes", data),
  get: (userId: string, id: string) =>
    getDocument<Note>(userId, "notes", id),
  update: (userId: string, id: string, data: Partial<Note>) =>
    updateDocument(userId, "notes", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "notes", id),
  listUnprocessed: (userId: string) =>
    queryDocuments<Note>(userId, "notes", where("processed", "==", false), orderBy("createdAt", "desc")),
};

// --- Focus Sessions ---

export const focusSessions = {
  create: (userId: string, data: Omit<FocusSession, "id">) =>
    createDocument<FocusSession>(userId, "focusSessions", data),
  get: (userId: string, id: string) =>
    getDocument<FocusSession>(userId, "focusSessions", id),
  update: (userId: string, id: string, data: Partial<FocusSession>) =>
    updateDocument(userId, "focusSessions", id, data),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<FocusSession>(userId, "focusSessions", ...constraints),
};

// --- Focus Blocks ---

export const focusBlocks = {
  create: (userId: string, data: Omit<FocusBlock, "id">) =>
    createDocument<FocusBlock>(userId, "focusBlocks", data),
  get: (userId: string, id: string) =>
    getDocument<FocusBlock>(userId, "focusBlocks", id),
  update: (userId: string, id: string, data: Partial<FocusBlock>) =>
    updateDocument(userId, "focusBlocks", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "focusBlocks", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<FocusBlock>(userId, "focusBlocks", ...constraints),
};

// --- Journeys ---

export const journeys = {
  create: (userId: string, data: Omit<Journey, "id">) =>
    createDocument<Journey>(userId, "journeys", data),
  get: (userId: string, id: string) =>
    getDocument<Journey>(userId, "journeys", id),
  update: (userId: string, id: string, data: Partial<Journey>) =>
    updateDocument(userId, "journeys", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "journeys", id),
  listActive: (userId: string) =>
    queryDocuments<Journey>(userId, "journeys", where("isActive", "==", true)),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Journey>(userId, "journeys", ...constraints),
};

// --- Quests ---

export const quests = {
  create: (userId: string, data: Omit<Quest, "id">) =>
    createDocument<Quest>(userId, "quests", data),
  get: (userId: string, id: string) =>
    getDocument<Quest>(userId, "quests", id),
  update: (userId: string, id: string, data: Partial<Quest>) =>
    updateDocument(userId, "quests", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "quests", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Quest>(userId, "quests", ...constraints),
};

// --- Goals ---

export const goals = {
  create: (userId: string, data: Omit<Goal, "id">) =>
    createDocument<Goal>(userId, "goals", data),
  get: (userId: string, id: string) =>
    getDocument<Goal>(userId, "goals", id),
  update: (userId: string, id: string, data: Partial<Goal>) =>
    updateDocument(userId, "goals", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "goals", id),
  listByYear: (userId: string, year: number) =>
    queryDocuments<Goal>(userId, "goals", where("year", "==", year)),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Goal>(userId, "goals", ...constraints),
};

// --- Projects ---

export const projects = {
  create: (userId: string, data: Omit<Project, "id">) =>
    createDocument<Project>(userId, "projects", data),
  get: (userId: string, id: string) =>
    getDocument<Project>(userId, "projects", id),
  update: (userId: string, id: string, data: Partial<Project>) =>
    updateDocument(userId, "projects", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "projects", id),
  listActive: (userId: string) =>
    queryDocuments<Project>(userId, "projects", where("status", "in", ["planning", "active"])),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Project>(userId, "projects", ...constraints),
};

// --- Habits ---

export const habits = {
  create: (userId: string, data: Omit<Habit, "id">) =>
    createDocument<Habit>(userId, "habits", data),
  get: (userId: string, id: string) =>
    getDocument<Habit>(userId, "habits", id),
  update: (userId: string, id: string, data: Partial<Habit>) =>
    updateDocument(userId, "habits", id, data),
  delete: (userId: string, id: string) =>
    deleteDocument(userId, "habits", id),
  list: (userId: string, ...constraints: QueryConstraint[]) =>
    queryDocuments<Habit>(userId, "habits", ...constraints),
};

// --- Daily Logs ---

export const dailyLogs = {
  get: (userId: string, date: string) =>
    getDocument<DailyLog>(userId, "dailyLogs", date),
  set: (userId: string, date: string, data: Partial<DailyLog>) =>
    setDoc(
      userDoc(userId, "dailyLogs", date),
      toFirestoreData(data as Record<string, unknown>),
      { merge: true }
    ),
};

// --- Streaks ---

export const streaks = {
  get: async (userId: string): Promise<Streaks | null> => {
    const snap = await getDoc(doc(getDb(), `users/${userId}/streaks/data`));
    if (!snap.exists()) return null;
    return snap.data() as Streaks;
  },
  set: (userId: string, data: Partial<Streaks>) =>
    setDoc(doc(getDb(), `users/${userId}/streaks/data`), data, { merge: true }),
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
  get: (userId: string, areaId: string) =>
    getDocument<Area>(userId, "areas", areaId),
  set: (userId: string, areaId: string, data: Partial<Area>) =>
    setDoc(
      userDoc(userId, "areas", areaId),
      toFirestoreData(data as Record<string, unknown>),
      { merge: true }
    ),
  list: (userId: string) =>
    queryDocuments<Area>(userId, "areas"),
};
