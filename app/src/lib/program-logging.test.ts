import { describe, expect, it, vi } from "vitest";
import { logExercises, remainingExercisesForToday } from "./program-logging";
import type { ProgramExercise } from "./types";

const now = new Date("2026-09-09T00:05:00+02:00");

function exercise(id: string, dates: string[] = []): ProgramExercise {
  return {
    id,
    day: "tue",
    order: 0,
    dayLabel: "Push",
    name: id,
    sets: 3,
    targetReps: 8,
    currentWeightKg: 20,
    history: dates.map((date) => ({ date: new Date(date), weightKg: 20 })),
    createdAt: now,
    updatedAt: now,
  };
}

describe("program bulk logging", () => {
  it("skips exercises already logged on the local calendar day", () => {
    const remaining = remainingExercisesForToday([
      exercise("done", ["2026-09-09T00:01:00+02:00"]),
      exercise("yesterday", ["2026-09-08T23:59:00+02:00"]),
      exercise("new"),
    ], now);

    expect(remaining.map((item) => item.id)).toEqual(["yesterday", "new"]);
  });

  it("reports partial failures without classifying successful logs as failed", async () => {
    const log = vi.fn((id: string) =>
      id === "bad" ? Promise.reject(new Error("offline")) : Promise.resolve(),
    );

    await expect(logExercises([exercise("first"), exercise("bad"), exercise("last")], log)).resolves.toEqual({
      loggedIds: ["first", "last"],
      failedIds: ["bad"],
    });
    expect(log).toHaveBeenCalledTimes(3);
  });

  it("waits for every request, including a synchronous failure", async () => {
    let release: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const log = vi.fn((id: string) => {
      if (id === "throw") throw new Error("bad input");
      return slow;
    });
    const outcome = logExercises([exercise("throw"), exercise("slow")], log);
    let settled = false;
    void outcome.then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    release?.();
    await expect(outcome).resolves.toEqual({ loggedIds: ["slow"], failedIds: ["throw"] });
  });
});
