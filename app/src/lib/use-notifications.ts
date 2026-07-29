"use client";

// Pager messages (homelab notifications ingested via /api/notify).
//
// Subscribes to the collection directly (not via useCollection) so the query
// can carry limit(100), and layers an optimistic overlay on top: markRead /
// ack / remove reflect in local state instantly, the server write follows.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, collection, onSnapshot, query, orderBy, limit } from "./local-db";
import { updateDocument, deleteDocument } from "./firestore";
import { useAuth, LOCAL_USER } from "./auth-context";

export const PAGER_STREAMS = ["alerts", "nightly", "weekly", "capture", "system"] as const;
export type PagerStream = (typeof PAGER_STREAMS)[number];
export type PagerSeverity = "page" | "info" | "low";

export interface PagerAction {
  label: string;
  kind: "ack";
}

export interface PagerMessage {
  id: string;
  stream: PagerStream;
  severity: PagerSeverity;
  title?: string | null;
  body: string;
  actions?: PagerAction[] | null;
  /** In-app deep link the notification targets (absent on legacy rows). */
  path?: string | null;
  createdAt: Date;
  readAt?: Date | null;
  /** Set when Samy acks — the audit trail lives here, not in the body. */
  ackedAt?: Date | null;
}

const COLLECTION = "notifications";
const DELETE_COMMIT_MS = 5000; // sonner's default toast window is 4s

const SEVERITY_RANK: Record<PagerSeverity, number> = { page: 0, info: 1, low: 2 };

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const toD = (v as { toDate?: unknown } | null | undefined)?.toDate;
  if (typeof toD === "function") return (toD as () => Date).call(v);
  return null;
}

export function useNotifications() {
  // Single-user app: useAuth() always yields LOCAL_USER (see auth-context.tsx).
  const uid = (useAuth().user ?? LOCAL_USER).uid;
  const [items, setItems] = useState<PagerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Optimistic overlay: id -> patch to merge, or null -> hidden (pending delete).
  const [overrides, setOverrides] = useState<Record<string, Partial<PagerMessage> | null>>({});
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const ref = collection(db, `users/${uid}/${COLLECTION}`);
    const q = query(ref, orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((doc) => {
          const d = doc.data();
          return {
            ...d,
            id: doc.id,
            createdAt: toDate(d.createdAt) ?? new Date(),
            readAt: toDate(d.readAt),
            ackedAt: toDate(d.ackedAt),
          } as PagerMessage;
        })
      );
      setLoading(false);
    });
  }, [uid]);

  // Unread first, then severity page > info > low, then newest first.
  const messages = useMemo(() => {
    return items
      .filter((m) => overrides[m.id] !== null)
      .map((m) => (overrides[m.id] ? { ...m, ...overrides[m.id] } : m))
      .sort((a, b) => {
        const unread = Number(Boolean(a.readAt)) - Number(Boolean(b.readAt));
        if (unread !== 0) return unread;
        const sev = (SEVERITY_RANK[a.severity] ?? 1) - (SEVERITY_RANK[b.severity] ?? 1);
        if (sev !== 0) return sev;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }, [items, overrides]);

  const patch = useCallback(
    (id: string, data: Partial<PagerMessage>) => {
      setOverrides((o) => ({ ...o, [id]: { ...o[id], ...data } }));
      return updateDocument(uid, COLLECTION, id, data as Record<string, unknown>);
    },
    [uid]
  );

  const markRead = useCallback((id: string) => patch(id, { readAt: new Date() }), [patch]);

  // "ack": mark read + stamp ackedAt. No shell/webhook execution — by design.
  const ack = useCallback(
    (m: PagerMessage) => patch(m.id, { readAt: new Date(), ackedAt: new Date() }),
    [patch]
  );

  const markAllRead = useCallback(
    async (msgs: PagerMessage[]) => {
      await Promise.all(msgs.filter((m) => !m.readAt).map((m) => markRead(m.id)));
    },
    [markRead]
  );

  // Delete = optimistically hide now, commit to the server after the undo
  // window. undoRemove() inside that window cancels the commit and unhides.
  const remove = useCallback(
    (id: string) => {
      setOverrides((o) => ({ ...o, [id]: null }));
      const t = setTimeout(() => {
        pendingDeletes.current.delete(id);
        deleteDocument(uid, COLLECTION, id);
      }, DELETE_COMMIT_MS);
      pendingDeletes.current.set(id, t);
    },
    [uid]
  );

  const undoRemove = useCallback((id: string) => {
    const t = pendingDeletes.current.get(id);
    if (t) {
      clearTimeout(t);
      pendingDeletes.current.delete(id);
    }
    setOverrides((o) => {
      const { [id]: _drop, ...rest } = o;
      void _drop;
      return rest;
    });
  }, []);

  // Navigating away must not resurrect a deleted message: flush pending
  // deletes immediately on unmount.
  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      for (const [id, t] of pending) {
        clearTimeout(t);
        deleteDocument(uid, COLLECTION, id);
      }
      pending.clear();
    };
  }, [uid]);

  return { messages, loading, markRead, markAllRead, ack, remove, undoRemove };
}
