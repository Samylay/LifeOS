import { localDayOf, type Habit } from "./types";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export type HabitEdit = Pick<Habit, "name" | "frequency" | "daysOfWeek">;

/** Only configuration fields enter an edit; history, ID and streak survive. */
export function habitEdit(name: string, schedule: "daily" | "weekly" | "custom", days: number[]): HabitEdit {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the habit a name.");
  if (trimmed.length > 120) throw new Error("Keep the name under 120 characters.");
  const unique = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort();
  if (schedule === "custom" && !unique.length) throw new Error("Choose at least one day.");
  return { name: trimmed, frequency: schedule === "weekly" ? "weekly" : "daily", daysOfWeek: schedule === "custom" ? unique : [] };
}

export function sortHabits<T extends Habit>(habits: T[]): T[] {
  return habits.map((habit, index) => ({ habit: { ...habit, order: habit.order ?? index }, index }))
    .sort((a, b) => (a.habit.order ?? a.index) - (b.habit.order ?? b.index) || a.index - b.index)
    .map(({ habit }) => habit);
}

export function habitDue(habit: Habit, now = new Date()): boolean {
  return (!habit.status || habit.status === "active") &&
    (!habit.daysOfWeek?.length || habit.daysOfWeek.includes(now.getDay()));
}

function weekStart(now: Date): string {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return localDayOf(monday);
}

export function habitCompleted(habit: Habit, now = new Date()): boolean {
  const today = localDayOf(now);
  const start = habit.frequency === "weekly" ? weekStart(now) : today;
  return habit.history.some((entry) => entry.completed && entry.date >= start && entry.date <= today);
}

export function scheduleLabel(habit: Pick<Habit, "frequency" | "daysOfWeek">): string {
  if (habit.daysOfWeek?.length) return [1, 2, 3, 4, 5, 6, 0].filter((day) => habit.daysOfWeek!.includes(day)).map((day) => WEEKDAYS[day]).join(" · ");
  return habit.frequency === "weekly" ? "Once a week" : "Every day";
}

/** Undo a weekly completion on its actual date; never add a second weekly tick. */
export function scheduledToggle(habit: Pick<Habit, "frequency" | "daysOfWeek" | "history">, now = new Date()): Pick<Habit, "history" | "streak"> {
  const today = localDayOf(now);
  const start = habit.frequency === "weekly" ? weekStart(now) : today;
  const completed = habit.history.find((entry) => entry.completed && entry.date >= start && entry.date <= today);
  const date = completed?.date ?? today;
  const existing = habit.history.some((entry) => entry.date === date);
  const history = existing
    ? habit.history.map((entry) => entry.date === date ? { ...entry, completed: !completed } : entry)
    : [...habit.history, { date, completed: true }];
  const dates = new Set(history.filter((entry) => entry.completed).map((entry) => entry.date));
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Bound by the earliest completion, so a custom schedule cannot loop forever.
  const earliest = [...dates].sort()[0] ?? today;
  while (localDayOf(cursor) >= earliest) {
    if (habit.frequency === "weekly") {
      const end = localDayOf(cursor);
      const start = weekStart(cursor);
      if (![...dates].some((date) => date >= start && date <= end)) break;
      streak++;
      cursor.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7 - 1);
    } else {
      if (!habit.daysOfWeek?.length || habit.daysOfWeek.includes(cursor.getDay())) {
        if (!dates.has(localDayOf(cursor))) break;
        streak++;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  return { history, streak };
}
