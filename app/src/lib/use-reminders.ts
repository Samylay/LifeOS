"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Reminder, ReminderFrequency } from "./types";

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
  const { items: reminders, loading, create, update, remove } =
    useCollection<Reminder>("reminders", {
      orderByField: "dueDate",
      orderDir: "asc",
      fallbackDates: ["dueDate", "createdAt"],
    });

  const createReminder = useCallback(
    async (data: Omit<Reminder, "id" | "createdAt" | "completed">) => {
      return await create({ ...data, completed: false, createdAt: new Date() });
    },
    [create]
  );

  const completeReminder = useCallback(
    async (id: string) => {
      const reminder = reminders.find((r) => r.id === id);
      if (!reminder) return;

      const today = new Date().toISOString().split("T")[0];

      if (reminder.frequency === "once") {
        // One-time: just mark completed
        await update(id, { completed: true, lastCompletedDate: today });
      } else {
        // Recurring: advance to next due date
        const nextDue = getNextDueDate(new Date(reminder.dueDate), reminder.frequency);
        await update(id, { dueDate: nextDue, lastCompletedDate: today });
      }
    },
    [reminders, update]
  );

  const updateReminder = useCallback(
    async (id: string, data: Partial<Reminder>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteReminder = useCallback(async (id: string) => remove(id), [remove]);

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
