import { describe, it, expect } from "vitest";
import { normalizeTag, parseTags } from "./types";

describe("normalizeTag", () => {
  it("lowercases and kebabs", () => {
    expect(normalizeTag("  LifeOS ")).toBe("lifeos");
    expect(normalizeTag("Infra Fix")).toBe("infra-fix");
  });
  it("strips a leading # and junk characters", () => {
    expect(normalizeTag("#content")).toBe("content");
    expect(normalizeTag("v1.2/beta!")).toBe("v1.2beta");
  });
});

describe("parseTags", () => {
  it("splits on commas, normalizes, dedupes, drops empties", () => {
    expect(parseTags("LifeOS, infra fix, lifeos, ,#infra-fix")).toEqual(["lifeos", "infra-fix"]);
    expect(parseTags("")).toEqual([]);
  });
});
