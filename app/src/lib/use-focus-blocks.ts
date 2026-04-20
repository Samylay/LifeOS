"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { focusBlocks as focusBlocksApi } from "./firestore";
import type { FocusBlock } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useFocusBlocks() {
  const { user, isFirebaseConfigured } = useAuth();
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/focusBlocks`),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        } as FocusBlock;
      });
      setBlocks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createBlock = useCallback(
    async (
      data: Omit<FocusBlock, "id" | "createdAt" | "updatedAt" | "sessionIds" | "status"> & {
        sessionIds?: string[];
        status?: FocusBlock["status"];
      }
    ) => {
      const now = new Date();
      const payload: Omit<FocusBlock, "id"> = {
        ...data,
        sessionIds: data.sessionIds ?? [],
        status: data.status ?? "scheduled",
        createdAt: now,
        updatedAt: now,
      };
      if (isFirebaseConfigured && user) {
        return await focusBlocksApi.create(user.uid, payload);
      } else {
        const block: FocusBlock = { ...payload, id: `local-block-${++localIdCounter}` };
        setBlocks((prev) => [block, ...prev]);
        return block.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateBlock = useCallback(
    async (id: string, data: Partial<FocusBlock>) => {
      if (isFirebaseConfigured && user) {
        await focusBlocksApi.update(user.uid, id, { ...data, updatedAt: new Date() });
      } else {
        setBlocks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...data, updatedAt: new Date() } : b))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await focusBlocksApi.delete(user.uid, id);
      } else {
        setBlocks((prev) => prev.filter((b) => b.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  // Append a session id to a block's sessionIds and bump status as needed.
  const attachSession = useCallback(
    async (id: string, sessionId: string, opts?: { complete?: boolean }) => {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      const sessionIds = [...block.sessionIds, sessionId];
      const update: Partial<FocusBlock> = { sessionIds };
      if (block.status === "scheduled") update.status = "active";
      if (opts?.complete || sessionIds.length >= block.sessionCount) {
        update.status = "done";
      }
      await updateBlock(id, update);
    },
    [blocks, updateBlock]
  );

  const today = new Date().toISOString().split("T")[0];
  const todayBlocks = blocks.filter((b) => b.date === today);
  const upcomingBlocks = blocks.filter(
    (b) => b.status === "scheduled" && b.date >= today
  );
  const activeBlocks = blocks.filter((b) => b.status === "active");
  const doneBlocks = blocks.filter((b) => b.status === "done");

  return {
    blocks,
    todayBlocks,
    upcomingBlocks,
    activeBlocks,
    doneBlocks,
    loading,
    createBlock,
    updateBlock,
    deleteBlock,
    attachSession,
  };
}
