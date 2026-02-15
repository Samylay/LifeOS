"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { journeys as journeysApi } from "./firestore";
import type { Journey, JourneyTier } from "./types";
import { TIER_HOURS } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

function computeTier(hours: number): JourneyTier {
  if (hours >= TIER_HOURS[7]) return 7;
  if (hours >= TIER_HOURS[6]) return 6;
  if (hours >= TIER_HOURS[5]) return 5;
  if (hours >= TIER_HOURS[4]) return 4;
  if (hours >= TIER_HOURS[3]) return 3;
  if (hours >= TIER_HOURS[2]) return 2;
  return 1;
}

export function useJourneys() {
  const { user, isFirebaseConfigured } = useAuth();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/journeys`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          tierHistory: (data.tierHistory || []).map((th: { tier: JourneyTier; reachedAt: { toDate?: () => Date } }) => ({
            ...th,
            reachedAt: th.reachedAt?.toDate?.() || new Date(),
          })),
        } as Journey;
      });
      setJourneys(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createJourney = useCallback(
    async (data: Omit<Journey, "id" | "createdAt" | "totalHours" | "currentTier" | "tierHistory">) => {
      const now = new Date();
      const journeyData: Omit<Journey, "id"> = {
        ...data,
        totalHours: 0,
        currentTier: 1,
        tierHistory: [{ tier: 1, reachedAt: now }],
        createdAt: now,
      };
      if (isFirebaseConfigured && user) {
        return await journeysApi.create(user.uid, journeyData);
      } else {
        const newJourney: Journey = {
          ...journeyData,
          id: `local-journey-${++localIdCounter}`,
        };
        setJourneys((prev) => [newJourney, ...prev]);
        return newJourney.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const addHours = useCallback(
    async (id: string, hours: number) => {
      const journey = journeys.find((j) => j.id === id);
      if (!journey) return;

      const newTotal = journey.totalHours + hours;
      const newTier = computeTier(newTotal);
      const tierChanged = newTier !== journey.currentTier;

      const updates: Partial<Journey> = {
        totalHours: newTotal,
        currentTier: newTier,
      };

      if (tierChanged) {
        updates.tierHistory = [
          ...journey.tierHistory,
          { tier: newTier, reachedAt: new Date() },
        ];
      }

      if (isFirebaseConfigured && user) {
        await journeysApi.update(user.uid, id, updates);
      } else {
        setJourneys((prev) =>
          prev.map((j) => (j.id === id ? { ...j, ...updates } : j))
        );
      }
    },
    [journeys, user, isFirebaseConfigured]
  );

  const updateJourney = useCallback(
    async (id: string, data: Partial<Journey>) => {
      if (isFirebaseConfigured && user) {
        await journeysApi.update(user.uid, id, data);
      } else {
        setJourneys((prev) =>
          prev.map((j) => (j.id === id ? { ...j, ...data } : j))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteJourney = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await journeysApi.delete(user.uid, id);
      } else {
        setJourneys((prev) => prev.filter((j) => j.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const activeJourneys = journeys.filter((j) => j.isActive);

  return { journeys, activeJourneys, loading, createJourney, addHours, updateJourney, deleteJourney };
}
