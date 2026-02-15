"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { notes as notesApi } from "./firestore";
import type { Note, AreaId } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useNotes() {
  const { user, isFirebaseConfigured } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/notes`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Note;
      });
      setNotes(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createNote = useCallback(
    async (data: Omit<Note, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await notesApi.create(user.uid, { ...data, createdAt: now });
      } else {
        const newNote: Note = {
          ...data,
          id: `local-note-${++localIdCounter}`,
          createdAt: now,
        };
        setNotes((prev) => [newNote, ...prev]);
        return newNote.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateNote = useCallback(
    async (id: string, data: Partial<Note>) => {
      if (isFirebaseConfigured && user) {
        await notesApi.update(user.uid, id, data);
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...data } : n))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await notesApi.delete(user.uid, id);
      } else {
        setNotes((prev) => prev.filter((n) => n.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { notes, loading, createNote, updateNote, deleteNote };
}
