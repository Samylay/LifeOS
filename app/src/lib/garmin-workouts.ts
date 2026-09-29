import type { RunSpec, Step, Zone } from "./training-plan";
import { PACE_SEC_PER_KM } from "./training-plan";

// Builds the Garmin Connect workout JSON for a planned run. Pace targets are
// speeds in m/s (lower bound first), which is what the pace.zone target expects.
const STEP_TYPE = { warmup: 1, cooldown: 2, work: 3, recovery: 4 } as const;
const STEP_KEY = { warmup: "warmup", cooldown: "cooldown", work: "interval", recovery: "recovery" } as const;
const SPORT = { sportTypeId: 1, sportTypeKey: "running" };

function target(zone: Zone) {
  if (zone === "none") return { targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" }, targetValueOne: null, targetValueTwo: null };
  const [fast, slow] = PACE_SEC_PER_KM[zone];
  return {
    targetType: { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" },
    targetValueOne: Math.round((1000 / slow) * 1000) / 1000,
    targetValueTwo: Math.round((1000 / fast) * 1000) / 1000,
  };
}

function executable(step: Step, order: number) {
  const byDistance = step.meters !== undefined;
  return {
    type: "ExecutableStepDTO",
    stepOrder: order,
    stepType: { stepTypeId: STEP_TYPE[step.kind], stepTypeKey: STEP_KEY[step.kind] },
    endCondition: byDistance
      ? { conditionTypeId: 3, conditionTypeKey: "distance" }
      : { conditionTypeId: 2, conditionTypeKey: "time" },
    endConditionValue: byDistance ? step.meters : step.seconds,
    ...target(step.zone),
  };
}

export function buildGarminRun(spec: RunSpec, name: string, description: string) {
  let order = 1;
  const workoutSteps = spec.blocks.map((block) => {
    if (block.times === 1) return executable(block.steps[0], order++);
    const repeatOrder = order++;
    return {
      type: "RepeatGroupDTO",
      stepOrder: repeatOrder,
      stepType: { stepTypeId: 6, stepTypeKey: "repeat" },
      numberOfIterations: block.times,
      endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
      endConditionValue: block.times,
      smartRepeat: false,
      workoutSteps: block.steps.map((s) => executable(s, order++)),
    };
  });
  return {
    workoutName: name,
    description,
    sportType: SPORT,
    workoutSegments: [{ segmentOrder: 1, sportType: SPORT, workoutSteps }],
  };
}
