"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { reminders as remindersApi } from "./firestore";
import type { Reminder, ReminderFrequency, AreaId } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

function isOverdue(reminder: Reminder): boolean {
  if (reminder.completed) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(reminder.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < now;
}

function isDueToday(reminder: Reminder): boolean {
  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(reminder.dueDate).toISOString().split("T")[0];
  return dueDate === today;
}

function getNextDueDate(current: Date, frequency: ReminderFrequency): Date {
  const next = new Date(current);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

export function useReminders() {
  const { user, isFirebaseConfigured } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/reminders`),
      orderBy("dueDate", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          dueDate: data.dueDate?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Reminder;
      });
      setReminders(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createReminder = useCallback(
    async (data: Omit<Reminder, "id" | "createdAt" | "completed">) => {
      const now = new Date();
      const newData = { ...data, completed: false, createdAt: now };
      if (isFirebaseConfigured && user) {
        return await remindersApi.create(user.uid, newData);
      } else {
        const reminder: Reminder = {
          ...newData,
          id: `local-reminder-${++localIdCounter}`,
        };
        setReminders((prev) => [...prev, reminder]);
        return reminder.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const completeReminder = useCallback(
    async (id: string) => {
      const reminder = reminders.find((r) => r.id === id);
      if (!reminder) return;

      const today = new Date().toISOString().split("T")[0];

      if (reminder.frequency === "once") {
        // One-time: just mark completed
        if (isFirebaseConfigured && user) {
          await remindersApi.update(user.uid, id, {
            completed: true,
            lastCompletedDate: today,
          });
        } else {
          setReminders((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, completed: true, lastCompletedDate: today } : r
            )
          );
        }
      } else {
        // Recurring: advance to next due date
        const nextDue = getNextDueDate(new Date(reminder.dueDate), reminder.frequency);
        if (isFirebaseConfigured && user) {
          await remindersApi.update(user.uid, id, {
            dueDate: nextDue,
            lastCompletedDate: today,
          });
        } else {
          setReminders((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, dueDate: nextDue, lastCompletedDate: today }
                : r
            )
          );
        }
      }
    },
    [reminders, user, isFirebaseConfigured]
  );

  const updateReminder = useCallback(
    async (id: string, data: Partial<Reminder>) => {
      if (isFirebaseConfigured && user) {
        await remindersApi.update(user.uid, id, data);
      } else {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...data } : r))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await remindersApi.delete(user.uid, id);
      } else {
        setReminders((prev) => prev.filter((r) => r.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const active = reminders.filter((r) => !r.completed);
  const overdue = active.filter(isOverdue);
  const dueToday = active.filter(isDueToday);
  const upcoming = active.filter((r) => !isOverdue(r) && !isDueToday(r));
  const completed = reminders.filter((r) => r.completed);

  return {
    reminders,
    active,
    overdue,
    dueToday,
    upcoming,
    completed,
    loading,
    createReminder,
    completeReminder,
    updateReminder,
    deleteReminder,
  };
}
