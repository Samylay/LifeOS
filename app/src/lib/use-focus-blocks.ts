"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { focusBlocks as blocksApi } from "./firestore";
import type { FocusBlock, FocusBlockStatus, AreaId } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export interface FocusBlockTemplate {
  name: string;
  title: string;
  duration: number; // minutes
  sessionDuration: number;
  breakDuration: number;
  bufferMinutes: number;
}

export const BLOCK_TEMPLATES: FocusBlockTemplate[] = [
  { name: "Morning Deep Work 2h", title: "Morning Deep Work", duration: 120, sessionDuration: 25, breakDuration: 5, bufferMinutes: 10 },
  { name: "Afternoon Focus 1.5h", title: "Afternoon Focus", duration: 90, sessionDuration: 25, breakDuration: 5, bufferMinutes: 5 },
  { name: "Evening Study 1h", title: "Evening Study", duration: 60, sessionDuration: 25, breakDuration: 5, bufferMinutes: 0 },
  { name: "Sprint 45min", title: "Sprint", duration: 45, sessionDuration: 45, breakDuration: 0, bufferMinutes: 0 },
];

function calculateSessionCount(durationMin: number, sessionMin: number, breakMin: number): number {
  if (sessionMin <= 0) return 0;
  const cycleMin = sessionMin + breakMin;
  return Math.floor((durationMin + breakMin) / cycleMin);
}

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
        return { ...data, id: doc.id } as FocusBlock;
      });
      setBlocks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createBlock = useCallback(
    async (data: Omit<FocusBlock, "id" | "sessionIds" | "sessionCount">) => {
      const startMinutes = parseInt(data.startTime.split(":")[0]) * 60 + parseInt(data.startTime.split(":")[1]);
      const endMinutes = parseInt(data.endTime.split(":")[0]) * 60 + parseInt(data.endTime.split(":")[1]);
      const durationMinutes = endMinutes - startMinutes - data.bufferMinutes;
      const sessionCount = calculateSessionCount(durationMinutes, data.sessionDuration, data.breakDuration);

      const blockData = {
        ...data,
        sessionCount,
        sessionIds: [],
      };

      if (isFirebaseConfigured && user) {
        return await blocksApi.create(user.uid, blockData);
      } else {
        const newBlock: FocusBlock = {
          ...blockData,
          id: `local-block-${++localIdCounter}`,
        };
        setBlocks((prev) => [newBlock, ...prev]);
        return newBlock.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateBlock = useCallback(
    async (id: string, data: Partial<FocusBlock>) => {
      if (isFirebaseConfigured && user) {
        await blocksApi.update(user.uid, id, data);
      } else {
        setBlocks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...data } : b))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await blocksApi.delete(user.uid, id);
      } else {
        setBlocks((prev) => prev.filter((b) => b.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { blocks, loading, createBlock, updateBlock, deleteBlock, BLOCK_TEMPLATES };
}
