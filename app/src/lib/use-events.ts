"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { events as eventsApi } from "./firestore";
import type { CalendarEvent } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useEvents() {
  const { user, isFirebaseConfigured } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/events`),
      orderBy("start", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          start: data.start?.toDate?.() || new Date(),
          end: data.end?.toDate?.() || new Date(),
        } as CalendarEvent;
      });
      setEvents(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createEvent = useCallback(
    async (data: Omit<CalendarEvent, "id">) => {
      if (isFirebaseConfigured && user) {
        return await eventsApi.create(user.uid, data);
      } else {
        const event: CalendarEvent = { ...data, id: `local-event-${++localIdCounter}` };
        setEvents((prev) => [...prev, event]);
        return event.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateEvent = useCallback(
    async (id: string, data: Partial<CalendarEvent>) => {
      if (isFirebaseConfigured && user) {
        await eventsApi.update(user.uid, id, data);
      } else {
        setEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...e, ...data } : e))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await eventsApi.delete(user.uid, id);
      } else {
        setEvents((prev) => prev.filter((e) => e.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return {
    events,
    loading,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
