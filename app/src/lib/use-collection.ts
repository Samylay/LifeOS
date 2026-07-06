"use client";

// Generic collection hook. Every "list of docs" hook (tasks, notes, goals,
// projects, …) used to carry its own copy of the onSnapshot subscription plus
// a dead in-memory else-branch from the Firebase era. This factory is that
// pattern written once, on the always-on local path: subscribe to
// `users/<uid>/<collection>` via the local-db shim, revive dates, and expose
// create/update/remove through the /api/data CRUD helpers.

import { useState, useEffect, useCallback } from "react";
import { db, collection, onSnapshot, query, orderBy } from "./local-db";
import { createDocument, updateDocument, deleteDocument } from "./firestore";
import { useAuth, LOCAL_USER } from "./auth-context";

export interface UseCollectionOptions<T> {
  orderByField?: string;
  orderDir?: "asc" | "desc";
  /**
   * Date fields that must always be a `Date` on the returned items, falling
   * back to `new Date()` when missing (the old `d.x?.toDate?.() || new Date()`
   * behavior). Other Timestamp fields are still revived, but stay undefined
   * when absent (e.g. `targetDate`, `buildStarted`).
   */
  fallbackDates?: string[];
  /** Defaults merged under each fetched doc (e.g. `{ milestones: [] }`). */
  defaults?: Partial<T>;
}

/** Recursively convert local-db Timestamps ({ toDate() }) into Dates. */
function reviveTimestamps(value: unknown): unknown {
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate === "function") return (toDate as () => Date).call(value);
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = reviveTimestamps(v);
  }
  return out;
}

const DEFAULT_FALLBACK_DATES = ["createdAt", "updatedAt"];

export function useCollection<T extends { id: string }>(
  collectionName: string,
  {
    orderByField,
    orderDir = "asc",
    fallbackDates = DEFAULT_FALLBACK_DATES,
    defaults,
  }: UseCollectionOptions<T> = {}
) {
  // Single-user app: useAuth() always yields LOCAL_USER (see auth-context.tsx).
  const uid = (useAuth().user ?? LOCAL_USER).uid;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, `users/${uid}/${collectionName}`);
    const q = orderByField ? query(ref, orderBy(orderByField, orderDir)) : query(ref);
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((doc) => {
          const d = reviveTimestamps(doc.data()) as Record<string, unknown>;
          for (const field of fallbackDates) {
            if (!(d[field] instanceof Date)) d[field] = new Date();
          }
          return { ...defaults, ...d, id: doc.id } as T;
        })
      );
      setLoading(false);
    });
    // fallbackDates/defaults are config literals; identity changes are noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, collectionName, orderByField, orderDir]);

  const create = useCallback(
    (data: Omit<T, "id">) =>
      createDocument(uid, collectionName, data as Record<string, unknown>),
    [uid, collectionName]
  );

  const update = useCallback(
    (id: string, data: Partial<T>) =>
      updateDocument(uid, collectionName, id, data as Record<string, unknown>),
    [uid, collectionName]
  );

  const remove = useCallback(
    (id: string) => deleteDocument(uid, collectionName, id),
    [uid, collectionName]
  );

  return { items, loading, create, update, remove };
}
