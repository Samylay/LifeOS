import { describe, expect, it } from "vitest";
import { buildGarminRun } from "./garmin-workouts";
import { sessionsForWeek } from "./training-plan";

describe("buildGarminRun", () => {
  it("nests repeated blocks and converts pace to m/s", () => {
    const tempo = sessionsForWeek(3)[3].run!;
    const w = buildGarminRun(tempo, "LifeOS W3 Thu Tempo", "test");
    const steps = w.workoutSegments[0].workoutSteps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(3);
    expect(steps[1].type).toBe("RepeatGroupDTO");
    expect(steps[1].numberOfIterations).toBe(2);
    const inner = (steps[1].workoutSteps as Array<Record<string, unknown>>)[0];
    expect(inner.endConditionValue).toBe(480);
    expect(inner.targetValueOne as number).toBeLessThan(inner.targetValueTwo as number);
    expect(inner.targetValueTwo as number).toBeCloseTo(3.215, 2);
  });

  it("uses a distance end condition for intervals and no target for the time trial", () => {
    const w = buildGarminRun(sessionsForWeek(5)[5].run!, "x", "y");
    const repeat = (w.workoutSegments[0].workoutSteps as Array<Record<string, unknown>>)[1];
    expect((repeat.workoutSteps as Array<Record<string, unknown>>)[0].endCondition).toEqual({ conditionTypeId: 3, conditionTypeKey: "distance" });
    const tt = buildGarminRun(sessionsForWeek(1)[5].run!, "x", "y");
    expect((tt.workoutSegments[0].workoutSteps as Array<Record<string, unknown>>)[1].targetType).toEqual({ workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" });
  });
});
