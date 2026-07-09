import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { inferCentre, inferCentresCached } from "./centre-inference";

describe("inferCentre", () => {
  const fixtures: { title: string; centre: string }[] = [
    { title: "Fix the LifeOS brief scheduler bug", centre: "lifeos" },
    { title: "Ship the Flux onboarding flow", centre: "flux" },
    { title: "Grade Ecole submissions for Layaida cohort", centre: "ecole" },
    { title: "Review Scout crawler output", centre: "scout" },
    { title: "Fix reels-reader pagination", centre: "reels-reader" },
    { title: "Restart the n8n container on the homelab server", centre: "homelab-infra" },
    { title: "Long run - 12km easy pace", centre: "workouts" },
    { title: "Read chapter 4 of the polymath book", centre: "polymath" },
    { title: "Solve a leetcode algorithm problem", centre: "swe-learning" },
  ];

  for (const { title, centre } of fixtures) {
    it(`maps "${title}" to ${centre}`, () => {
      expect(inferCentre({ content: title })).toEqual({ centre, confidence: "high" });
    });
  }

  it("returns low confidence with no centre for an unmatched task", () => {
    expect(inferCentre({ content: "Buy milk" })).toEqual({ centre: null, confidence: "low" });
  });

  it("returns low confidence when a task matches more than one centre", () => {
    expect(inferCentre({ content: "Read about homelab server monitoring for the swe algorithm project" })).toEqual({
      centre: null,
      confidence: "low",
    });
  });

  it("considers the description as well as the title", () => {
    expect(
      inferCentre({ content: "Untitled task", description: "polymath reading list item" })
    ).toEqual({ centre: "polymath", confidence: "high" });
  });
});

describe("inferCentresCached", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-centre-cache-test-"));

  beforeEach(() => {
    process.env.LIFEOS_DB_PATH = path.join(tmpDir, `${Math.random()}`, "test.db");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("infers and caches, then reuses the cached result for unchanged content", () => {
    const task = { id: "1", content: "Long run - 12km easy pace" };
    const first = inferCentresCached([task]);
    expect(first).toEqual([{ id: "1", centre: "workouts", confidence: "high" }]);

    const second = inferCentresCached([task]);
    expect(second).toEqual(first);
  });

  it("re-infers when a cached task's content changes", () => {
    const original = { id: "1", content: "Long run - 12km easy pace" };
    inferCentresCached([original]);

    const edited = { id: "1", content: "Read chapter 4 of the polymath book" };
    const result = inferCentresCached([edited]);
    expect(result).toEqual([{ id: "1", centre: "polymath", confidence: "high" }]);
  });
});
