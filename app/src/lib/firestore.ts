// CRUD helpers for every collection — same surface as before, but backed by
// the local `/api/data` store instead of the Firestore SDK. Data is keyed by
// `users/<userId>/<collection>` exactly as it was in Firestore.
import {
  serializeDates,
  reviveDates,
  notifyWrite,
} from "./local-db";
import type {
  DailyLog,
} from "./types";

export type { QueryConstraint } from "./local-db";

// --- Transport ---------------------------------------------------------------

function userPath(userId: string, collectionPath: string): string {
  return `users/${userId}/${collectionPath}`;
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
  notifyWrite(fullPath);
  return id as string;
}

async function apiUpdate(fullPath: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`/api/data/${fullPath}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeDates(data)),
  });
  notifyWrite(fullPath);
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
  notifyWrite(fullPath);
}

async function apiDelete(fullPath: string): Promise<void> {
  await fetch(`/api/data/${fullPath}`, { method: "DELETE" });
  notifyWrite(fullPath);
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

// --- Daily Logs ---

export const dailyLogs = {
  get: (userId: string, date: string) => getDocument<DailyLog>(userId, "dailyLogs", date),
  set: (userId: string, date: string, data: Partial<DailyLog>) =>
    apiSet(`${userPath(userId, "dailyLogs")}/${date}`, data as Record<string, unknown>),
};
