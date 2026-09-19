import { experimental_evaluate as evaluate } from "ai";
import { gateway } from "@ai-sdk/gateway";

export const SPECIALISTS = ["general", "finance", "workout", "homelab"] as const;
export type SpecialistId = (typeof SPECIALISTS)[number];
export type JevRoute = "specialist" | "general" | "review" | "ask";
export type JevDecision = {
  route: JevRoute;
  specialistId: Exclude<SpecialistId, "general"> | null;
  confidence: "high" | "medium" | "low";
  probability: number;
  needsConfirmation: boolean;
  generalRequest: boolean;
  actionsAllowed: false;
};

export type JevState = { message: string; pageContext?: { path: string; title?: string; summary?: string } };
export type JevAdapter = (state: JevState, signal?: AbortSignal) => Promise<unknown>;

function choiceProbability(answer: unknown, choice: SpecialistId) {
  if (!answer || typeof answer !== "object") throw new Error("invalid specialist answer");
  const probabilities = (answer as { probabilities?: unknown }).probabilities;
  const probability = probabilities && typeof probabilities === "object"
    ? (probabilities as Record<string, unknown>)[choice]
    : undefined;
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("invalid specialist probability");
  }
  return probability;
}

function booleanProbability(answer: unknown) {
  if (!answer || typeof answer !== "object") throw new Error("invalid boolean answer");
  const probability = (answer as { probability?: unknown }).probability;
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("invalid boolean probability");
  }
  return probability;
}

export function decisionFromAnswers(answers: unknown): JevDecision {
  if (!answers || typeof answers !== "object") throw new Error("invalid Jev answers");
  const value = answers as Record<string, unknown>;
  const specialistAnswer = value.specialist;
  if (!specialistAnswer || typeof specialistAnswer !== "object") throw new Error("missing specialist answer");
  const choice = (specialistAnswer as { choice?: unknown }).choice;
  if (!SPECIALISTS.includes(choice as SpecialistId)) throw new Error("invalid specialist choice");
  const specialist = choice as SpecialistId;
  const probability = choiceProbability(specialistAnswer, specialist);
  const needsConfirmation = booleanProbability(value.needsConfirmation);
  const generalRequest = booleanProbability(value.generalRequest);
  const confidence = probability >= 0.85 ? "high" : probability >= 0.6 ? "medium" : "low";
  if (generalRequest >= 0.8) {
    return { route: "general", specialistId: null, confidence, probability, needsConfirmation: needsConfirmation >= 0.8, generalRequest: true, actionsAllowed: false };
  }
  if (confidence === "high" && specialist !== "general" && needsConfirmation < 0.8) {
    return { route: "specialist", specialistId: specialist, confidence, probability, needsConfirmation: needsConfirmation >= 0.8, generalRequest: generalRequest >= 0.8, actionsAllowed: false };
  }
  if (confidence === "high" && specialist === "general") {
    return { route: "general", specialistId: null, confidence, probability, needsConfirmation: needsConfirmation >= 0.8, generalRequest: generalRequest >= 0.8, actionsAllowed: false };
  }
  if (confidence === "medium" || (confidence === "high" && needsConfirmation >= 0.8)) {
    return { route: "review", specialistId: null, confidence, probability, needsConfirmation: needsConfirmation >= 0.8, generalRequest: generalRequest >= 0.8, actionsAllowed: false };
  }
  return { route: "ask", specialistId: null, confidence: "low", probability, needsConfirmation: needsConfirmation >= 0.8, generalRequest: generalRequest >= 0.8, actionsAllowed: false };
}

export const liveJevAdapter: JevAdapter = async (state, signal) => {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("jev_configuration");
  const result = await evaluate({
    model: gateway.evaluationModel(process.env.JEV_MODEL || "typesafe-ai/jev"),
    state,
    questions: {
      specialist: {
        type: "choice",
        instructions: "Which specialist domain should answer this request? Choose exactly one.",
        criteria: { general: "General questions or requests", finance: "Personal finance", workout: "Training and workouts", homelab: "Homelab infrastructure and services" },
      },
      needsConfirmation: {
        type: "boolean",
        instructions: "Does this request need human confirmation before any consequential action?",
        criteria: { true: "A consequential action or ambiguity needs confirmation", false: "Answering is safe without taking action" },
      },
      generalRequest: {
        type: "boolean",
        instructions: "Is this request general rather than belonging to a specialist domain?",
      },
    },
    providerOptions: { gateway: { zeroDataRetention: true } },
    abortSignal: signal,
  });
  return result.answers;
};

export async function routeWithJev(state: JevState, adapter = liveJevAdapter, signal?: AbortSignal): Promise<JevDecision> {
  try {
    return decisionFromAnswers(await adapter(state, signal));
  } catch {
    return { route: "ask", specialistId: null, confidence: "low", probability: 0, needsConfirmation: false, generalRequest: true, actionsAllowed: false };
  }
}
