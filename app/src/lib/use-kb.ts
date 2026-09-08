"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createRequestGate, isAbortError } from "./knowledge-request";

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
  const [suggestions, setSuggestions] = useState<NoteMeta[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const requestGate = useRef(createRequestGate());

  const refresh = useCallback(async (q?: string, signal?: AbortSignal) => {
    const request = requestGate.current.start();
    setLoading(true);
    try {
      const res = await fetch(`/api/kb${q ? `?q=${encodeURIComponent(q)}` : ""}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (signal?.aborted || !requestGate.current.isCurrent(request)) return;
      setEnabled(data.enabled !== false);
      setNotes(data.notes || []);
      setSuggestions(data.suggestions || []);
      setMessage(data.message || null);
      setError(null);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted || !requestGate.current.isCurrent(request)) return;
      setError("Couldn’t load saved knowledge.");
    } finally {
      if (!signal?.aborted && requestGate.current.isCurrent(request)) setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => void refresh(query, controller.signal), query ? 250 : 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
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

  return {
    notes,
    suggestions,
    message,
    enabled,
    loading,
    error,
    query,
    setQuery,
    refresh,
    readNote,
    createNote,
  };
}
