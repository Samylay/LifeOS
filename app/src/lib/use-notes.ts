"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Note } from "./types";

export function useNotes() {
  const { items: notes, loading, create, update, remove } = useCollection<Note>(
    "notes",
    { orderByField: "createdAt", orderDir: "desc", fallbackDates: ["createdAt"] }
  );

  const createNote = useCallback(
    async (data: Omit<Note, "id" | "createdAt">) => {
      return await create({ ...data, createdAt: new Date() });
    },
    [create]
  );

  const updateNote = useCallback(
    async (id: string, data: Partial<Note>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteNote = useCallback(async (id: string) => remove(id), [remove]);

  return { notes, loading, createNote, updateNote, deleteNote };
}
