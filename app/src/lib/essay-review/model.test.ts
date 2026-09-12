import { describe, expect, it } from "vitest";
import { DIMENSIONS, validateEssayInput, validateEssayReview, wordCount } from "./model";

const essay = "A clear claim begins this paragraph. ".repeat(20);
const input = validateEssayInput({ title: "Draft", prompt: "Explain the claim", genre: "analytical", audience: "General reader", constraints: "", essay });

describe("essay review model", () => {
  it("counts words and requires enough evidence", () => {
    expect(wordCount(" one  two\nthree ")).toBe(3);
    expect(() => validateEssayInput({ essay: "Too short." })).toThrow(/50 words/);
  });

  it("normalizes a complete review and preserves dimension order", () => {
    const review = validateEssayReview({
      verdict: "revise",
      summary: "The argument needs a clearer warrant.",
      priorities: [{ dimension: "reasoning", title: "Explain the link", reason: "The conclusion jumps.", action: "State why the evidence supports the claim." }],
      outline: [{ paragraph: 1, job: "State the claim", contribution: "Introduces the position." }],
      dimensions: [{ id: "reasoning", status: "needs-work", summary: "A link is missing.", findings: [{ quote: "A clear claim", issue: "This is asserted.", whyItMatters: "The reader cannot follow the inference.", revision: "Add the missing warrant.", confidence: "high" }] }],
    }, input);
    expect(review.dimensions).toHaveLength(DIMENSIONS.length);
    expect(review.dimensions.map((dimension) => dimension.id)).toEqual(DIMENSIONS.map((dimension) => dimension.id));
    expect(review.dimensions.find((dimension) => dimension.id === "reasoning")?.findings).toHaveLength(1);
  });

  it("drops fabricated quotes instead of presenting unsupported feedback", () => {
    const review = validateEssayReview({ dimensions: [{ id: "task", status: "needs-work", summary: "Off task.", findings: [{ quote: "Words that are not in the draft", issue: "Off task", whyItMatters: "It misses the prompt", revision: "Answer the question", confidence: "high" }] }] }, input);
    expect(review.dimensions[0].findings).toEqual([]);
  });

  it("accepts not-applicable for genre-sensitive criteria", () => {
    const review = validateEssayReview({ dimensions: [{ id: "counterargument", status: "not-applicable", summary: "This explanatory draft does not need an opposing position.", findings: [] }] }, input);
    expect(review.dimensions.find((dimension) => dimension.id === "counterargument")?.status).toBe("not-applicable");
  });
});
