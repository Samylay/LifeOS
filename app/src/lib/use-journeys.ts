"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { journeys as journeysApi } from "./firestore";
import type { Journey, JourneyTier, TierMilestone } from "./types";
import { tierForHours } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export interface TierUpEvent {
  journeyId: string;
  journeyTitle: string;
  fromTier: JourneyTier;
  toTier: JourneyTier;
}

export function useJourneys() {
  const { user, isFirebaseConfigured } = useAuth();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierUp, setTierUp] = useState<TierUpEvent | null>(null);

  // Snapshot of last-seen tiers to detect transitions
  const lastTiersRef = useRef<Record<string, JourneyTier>>({});

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/journeys`),
      orderBy("totalHours", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
          tierHistory: (data.tierHistory || []).map((t: { tier: number; reachedAt: { toDate?: () => Date } }) => ({
            tier: t.tier,
            reachedAt: t.reachedAt?.toDate?.() || new Date(),
          })),
        } as Journey;
      });

      // Detect tier-up between snapshots
      for (const j of items) {
        const prev = lastTiersRef.current[j.id];
        if (prev !== undefined && j.currentTier > prev) {
          setTierUp({
            journeyId: j.id,
            journeyTitle: j.title,
            fromTier: prev,
            toTier: j.currentTier,
          });
        }
        lastTiersRef.current[j.id] = j.currentTier;
      }

      setJourneys(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createJourney = useCallback(
    async (data: Omit<Journey, "id" | "createdAt" | "updatedAt" | "currentTier" | "tierHistory" | "totalHours"> & {
      totalHours?: number;
    }) => {
      const now = new Date();
      const totalHours = data.totalHours ?? 0;
      const currentTier = tierForHours(totalHours);
      const payload: Omit<Journey, "id"> = {
        ...data,
        totalHours,
        currentTier,
        tierHistory: [{ tier: 1, reachedAt: now }],
        createdAt: now,
        updatedAt: now,
      };
      if (isFirebaseConfigured && user) {
        return await journeysApi.create(user.uid, payload);
      } else {
        const j: Journey = { ...payload, id: `local-journey-${++localIdCounter}` };
        setJourneys((prev) => [j, ...prev]);
        lastTiersRef.current[j.id] = currentTier;
        return j.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateJourney = useCallback(
    async (id: string, data: Partial<Journey>) => {
      if (isFirebaseConfigured && user) {
        await journeysApi.update(user.uid, id, { ...data, updatedAt: new Date() });
      } else {
        setJourneys((prev) =>
          prev.map((j) => (j.id === id ? { ...j, ...data, updatedAt: new Date() } : j))
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
      delete lastTiersRef.current[id];
    },
    [user, isFirebaseConfigured]
  );

  // Add hours to a journey, recompute tier, append tier history if crossed.
  const addHours = useCallback(
    async (id: string, hours: number) => {
      const journey = journeys.find((j) => j.id === id);
      if (!journey) return;
      const newHours = journey.totalHours + hours;
      const newTier = tierForHours(newHours);
      const update: Partial<Journey> = {
        totalHours: newHours,
        currentTier: newTier,
      };
      if (newTier > journey.currentTier) {
        const milestones: TierMilestone[] = [];
        for (let t = journey.currentTier + 1; t <= newTier; t++) {
          milestones.push({ tier: t as JourneyTier, reachedAt: new Date() });
        }
        update.tierHistory = [...journey.tierHistory, ...milestones];
      }
      await updateJourney(id, update);
    },
    [journeys, updateJourney]
  );

  const dismissTierUp = useCallback(() => setTierUp(null), []);

  const activeJourneys = journeys.filter((j) => j.isActive);

  return {
    journeys,
    activeJourneys,
    loading,
    createJourney,
    updateJourney,
    deleteJourney,
    addHours,
    tierUp,
    dismissTierUp,
  };
}
