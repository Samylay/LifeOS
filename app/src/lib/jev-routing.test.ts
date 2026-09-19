import { describe, expect, it } from "vitest";
import { decisionFromAnswers, routeWithJev } from "./jev-routing";

const answers = (choice = "finance", probability = 0.95, confirmation = 0.1, general = 0.1) => ({
  specialist: { type: "choice", choice, probabilities: { [choice]: probability } },
  needsConfirmation: { type: "boolean", probability: confirmation },
  generalRequest: { type: "boolean", probability: general },
});

describe("Jev routing policy", () => {
  it("routes a high-confidence specialist without granting actions", () => {
    expect(decisionFromAnswers(answers())).toMatchObject({ route: "specialist", specialistId: "finance", confidence: "high", actionsAllowed: false });
  });
  it("routes medium confidence to review and risky routing to review", () => {
    expect(decisionFromAnswers(answers("workout", 0.7)).route).toBe("review");
    expect(decisionFromAnswers(answers("finance", 0.95, 0.9)).route).toBe("review");
  });
  it("routes general and low confidence safely", () => {
    expect(decisionFromAnswers(answers("general")).route).toBe("general");
    expect(decisionFromAnswers(answers("homelab", 0.4)).route).toBe("ask");
  });
  it("routes a threshold-level general request ahead of high specialist confidence", () => {
    expect(decisionFromAnswers(answers("finance", 0.95, 0.1, 0.8))).toMatchObject({ route: "general", specialistId: null, generalRequest: true });
  });
  it("rejects boolean values in numeric probability fields", () => {
    expect(() => decisionFromAnswers({ ...answers(), specialist: { ...answers().specialist, probabilities: { finance: true } } })).toThrow();
    expect(() => decisionFromAnswers({ ...answers(), needsConfirmation: { probability: true } })).toThrow();
    expect(() => decisionFromAnswers({ ...answers(), generalRequest: { probability: true } })).toThrow();
  });
  it("falls back on malformed output and adapter errors", async () => {
    expect(() => decisionFromAnswers({})).toThrow();
    await expect(routeWithJev({ message: "hi" }, async () => { throw new Error("429"); })).resolves.toMatchObject({ route: "ask", confidence: "low" });
  });
  it("handles timeout and preserves the typed fallback", async () => {
    await expect(routeWithJev({ message: "hi" }, async () => { throw new DOMException("timeout", "TimeoutError"); })).resolves.toMatchObject({ route: "ask", actionsAllowed: false });
  });
});
