"use client";

import { useState, useEffect, useCallback } from "react";

export interface NoteMeta {
  path: string;
  title: string;
  folder: string;
  mtime: number;
  summary?: string;
  tags?: string[];
}

export interface Note extends NoteMeta {
  content: string;
}

export function useKnowledge() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kb${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      setEnabled(data.enabled !== false);
      setNotes(data.notes || []);
    } catch {
      setEnabled(false);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => refresh(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, refresh]);

  const readNote = useCallback(async (path: string): Promise<Note | null> => {
    try {
      const res = await fetch(`/api/kb/note?path=${encodeURIComponent(path)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.note ?? null;
    } catch {
      return null;
    }
  }, []);

  const createNote = useCallback(
    async (opts: { title: string; content?: string; folder?: string }) => {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "failed to create note");
      }
      const data = await res.json();
      await refresh(query);
      return data.path as string;
    },
    [refresh, query]
  );

  return { notes, enabled, loading, query, setQuery, refresh, readNote, createNote };
}
