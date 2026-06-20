"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { weekendProjects as api } from "./firestore";
import type { WeekendProject } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

// The one existing entry. Language/depth choice is deliberately left open in the
// notes — preserve that openness; don't pre-decide it.
const SEED_PROJECTS: Omit<WeekendProject, "id" | "createdAt" | "updatedAt">[] = [
  {
    title: "Build your own Redis",
    learningGoal:
      "Understand what an in-memory data store actually is — how a key-value " +
      "server handles concurrent clients, why it's fast, and what " +
      '"single-threaded but performant" really means under the hood. ' +
      "Demystifies a tool you use without seeing inside.",
    weekendScope:
      "A TCP server speaking a subset of the RESP protocol (Redis's wire " +
      "format), handling PING, SET, GET, DEL, and key expiry (EXPIRE / TTL), " +
      "with real redis-cli as the client. Pointing the actual Redis CLI at " +
      "your homemade server and having it work is the moment that proves you " +
      "understood the thing.",
    stretch:
      "Event loop / single-threaded multiplexing (the thing that makes Redis " +
      "Redis); RDB-style persistence to disk; pub/sub; RESP3 protocol.",
    notes:
      'Canonical guide: "Build Your Own Redis" (CodeCrafters) / the ' +
      "Build Your Own Redis with C/C++ book.\n" +
      "- Node — leans on your existing strength; fastest path to understanding the concepts.\n" +
      "- Go — harder but more reward; concurrency model maps cleanly, and a real reason to finally use it.\n" +
      '- Systems-deep — focus on the event loop and performance layer; this is where "why is it fast" actually lives.\n' +
      "Decision: deferred. Capture now, choose lang/depth when you pick it up.",
    status: "idea",
  },
];

export function useWeekendProjects() {
  const { user, isFirebaseConfigured } = useAuth();
  const [projects, setProjects] = useState<WeekendProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/weekendProjects`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as WeekendProject;
      });
      setProjects(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createProject = useCallback(
    async (data: Omit<WeekendProject, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await api.create(user.uid, { ...data, createdAt: now, updatedAt: now });
      } else {
        const item: WeekendProject = {
          ...data,
          id: `local-weekend-${++localIdCounter}`,
          createdAt: now,
          updatedAt: now,
        };
        setProjects((prev) => [item, ...prev]);
        return item.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<WeekendProject>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, patch);
      } else {
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const seedDefaults = useCallback(async () => {
    for (const p of SEED_PROJECTS) {
      await createProject(p);
    }
  }, [createProject]);

  return { projects, loading, createProject, updateProject, deleteProject, seedDefaults };
}
