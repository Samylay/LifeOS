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

// Pending deletes live at module scope so the undo window survives navigating
// away from /pager — the toast (global) keeps its promise either way. The
// timeout, not unmount, is what commits the server delete.
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();
const pendingHidden = new Set<string>();

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
  // Optimistic overlay: id -> patch to merge (deletes are tracked in the
  // module-scope pendingHidden set).
  const [overrides, setOverrides] = useState<Record<string, Partial<PagerMessage>>>({});

  useEffect(() => {
    const ref = collection(db, `users/${uid}/${COLLECTION}`);
    const q = query(ref, orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snap) => {
      const next = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: toDate(d.createdAt) ?? new Date(),
          readAt: toDate(d.readAt),
          ackedAt: toDate(d.ackedAt),
        } as PagerMessage;
      });
      setItems(next);
      // Prune overlay entries the server now reflects, so a stale patch can
      // never mask a later server-side correction.
      setOverrides((o) => {
        const confirmed = new Map(next.map((m) => [m.id, m]));
        const kept: typeof o = {};
        for (const [id, p] of Object.entries(o)) {
          const server = confirmed.get(id);
          const reflected =
            server &&
            (!("readAt" in p) || Boolean(server.readAt)) &&
            (!("ackedAt" in p) || Boolean(server.ackedAt));
          if (!reflected) kept[id] = p;
        }
        return Object.keys(kept).length === Object.keys(o).length ? o : kept;
      });
      setLoading(false);
    });
  }, [uid]);

  // Unread first, then severity page > info > low, then newest first.
  const messages = useMemo(() => {
    return items
      .filter((m) => !pendingHidden.has(m.id))
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

  // Delete = optimistically hide now, commit to the server when the undo
  // window closes. The timer is module-scoped, so navigating away neither
  // resurrects the message (still in pendingHidden) nor forfeits the undo
  // the toast promised.
  const remove = useCallback(
    (id: string) => {
      pendingHidden.add(id);
      setOverrides((o) => ({ ...o })); // re-render with the id hidden
      const t = setTimeout(() => {
        pendingDeletes.delete(id);
        pendingHidden.delete(id);
        deleteDocument(uid, COLLECTION, id);
      }, DELETE_COMMIT_MS);
      pendingDeletes.set(id, t);
    },
    [uid]
  );

  const undoRemove = useCallback((id: string) => {
    const t = pendingDeletes.get(id);
    if (t) {
      clearTimeout(t);
      pendingDeletes.delete(id);
    }
    pendingHidden.delete(id);
    setOverrides((o) => {
      const { [id]: _drop, ...rest } = o;
      void _drop;
      return rest;
    });
  }, []);

  return { messages, loading, markRead, markAllRead, ack, remove, undoRemove };
}
