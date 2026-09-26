import { describe, expect, it } from "vitest";
import { LEARNING_AREAS, topicInArea, topicLabel } from "./learning-areas";

describe("learning area navigation", () => {
  it("keeps every topic reachable, including new interests", () => {
    for (const topic of ["Japanese JLPT", "Rust ownership", "Hegel's dialectic", "Solarpunk", "Quantitative trading", "Gentlemanly etiquette", "Astronomy", ""]) {
      expect(LEARNING_AREAS.some((area) => topicInArea(topic, area.id))).toBe(true);
    }
  });
  it("allows a goal to belong to more than one area", () => {
    expect(topicInArea("AI game design", "systems")).toBe(true);
    expect(topicInArea("AI game design", "creative")).toBe(true);
  });
  it("does not move unknown interests into a technical category", () => {
    expect(topicInArea("Astronomy", "computing")).toBe(false);
    expect(topicInArea("Astronomy", "personal")).toBe(true);
  });
  it("shortens the repeated introduction without clipping the actual goal", () => {
    expect(topicLabel("I want to understand distributed systems fundamentals")).toBe("Distributed systems fundamentals");
    expect(topicLabel("Gentlemanly etiquette of suits and accessories")).toBe("Gentlemanly etiquette of suits and accessories");
  });
});
