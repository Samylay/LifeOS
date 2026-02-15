"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { projects as projectsApi } from "./firestore";
import type { Project, ProjectStatus, AreaId } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useProjects() {
  const { user, isFirebaseConfigured } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/projects`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          targetDate: data.targetDate?.toDate?.() || undefined,
        } as Project;
      });
      setProjects(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createProject = useCallback(
    async (data: Omit<Project, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await projectsApi.create(user.uid, { ...data, createdAt: now });
      } else {
        const newProject: Project = {
          ...data,
          id: `local-project-${++localIdCounter}`,
          createdAt: now,
        };
        setProjects((prev) => [newProject, ...prev]);
        return newProject.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<Project>) => {
      if (isFirebaseConfigured && user) {
        await projectsApi.update(user.uid, id, data);
      } else {
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data } : p))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await projectsApi.delete(user.uid, id);
      } else {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { projects, loading, createProject, updateProject, deleteProject };
}
