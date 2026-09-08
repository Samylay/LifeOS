import { localDayOf, type ProgramExercise } from "@/lib/types";

export function loggedOnLocalDay(date: Date, reference: Date = new Date()): boolean {
  return localDayOf(new Date(date)) === localDayOf(reference);
}

/** Exercises that have no log on the local civil day in progress. */
export function remainingExercisesForToday(
  exercises: ProgramExercise[],
  reference: Date = new Date(),
): ProgramExercise[] {
  return exercises.filter((exercise) =>
    !exercise.history.some((entry) => loggedOnLocalDay(entry.date, reference)),
  );
}

/**
 * Runs each requested exercise independently. A partial failure must not hide
 * successful logs or invite a retry that duplicates them.
 */
export async function logExercises(
  exercises: ProgramExercise[],
  log: (id: string) => Promise<unknown> | undefined,
): Promise<{ loggedIds: string[]; failedIds: string[] }> {
  const results = await Promise.allSettled(
    exercises.map((exercise) => Promise.resolve().then(() => log(exercise.id))),
  );
  const loggedIds: string[] = [];
  const failedIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") loggedIds.push(exercises[index].id);
    else failedIds.push(exercises[index].id);
  });
  return { loggedIds, failedIds };
}
