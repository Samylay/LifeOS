import { describe, it, expect } from "vitest";
import { parseTriageReply, normalizeCentre } from "./triage-reply";

describe("parseTriageReply", () => {
  it("parses a mixed multi-verdict reply", () => {
    expect(parseTriageReply("1 approve, 2 to vault, 3 skip")).toEqual([
      { n: 1, action: "approve" },
      { n: 2, action: "vault" },
      { n: 3, action: "discard" },
    ]);
  });

  it("bare number means approve", () => {
    expect(parseTriageReply("4")).toEqual([{ n: 4, action: "approve" }]);
  });

  it("recognizes idea-bank synonyms", () => {
    expect(parseTriageReply("2 to idea-bank; 5 ideas; 7 bank")).toEqual([
      { n: 2, action: "idea-bank" },
      { n: 5, action: "idea-bank" },
      { n: 7, action: "idea-bank" },
    ]);
  });

  it("discard synonyms", () => {
    expect(parseTriageReply("1 skip, 2 discard, 3 no, 4 drop")).toEqual([
      { n: 1, action: "discard" }, { n: 2, action: "discard" },
      { n: 3, action: "discard" }, { n: 4, action: "discard" },
    ]);
  });

  it("backlog with a centre, normalized; backlog without a valid centre is dropped", () => {
    expect(parseTriageReply("3 backlog swe")).toEqual([{ n: 3, action: "backlog", centre: "swe-learning" }]);
    expect(parseTriageReply("3 to backlog: polymath")).toEqual([{ n: 3, action: "backlog", centre: "polymath" }]);
    expect(parseTriageReply("3 backlog nonsense")).toEqual([]); // invalid centre → skipped
  });

  it("dedupes repeated numbers (first wins) and ignores verb-only noise", () => {
    expect(parseTriageReply("1 approve, 1 skip")).toEqual([{ n: 1, action: "approve" }]);
    expect(parseTriageReply("just skip everything")).toEqual([]); // no number anchors
  });

  it("tolerates newline separators", () => {
    expect(parseTriageReply("1 approve\n2 vault")).toEqual([
      { n: 1, action: "approve" }, { n: 2, action: "vault" },
    ]);
  });
});

describe("normalizeCentre", () => {
  it("maps aliases to canonical backlog centres", () => {
    expect(normalizeCentre("workout")).toBe("workouts");
    expect(normalizeCentre("SWE")).toBe("swe-learning");
    expect(normalizeCentre("coding")).toBe("swe-learning");
    expect(normalizeCentre("nope")).toBeNull();
  });

  it("handles the study step's verbose destination labels", () => {
    expect(normalizeCentre("software-engineering learning")).toBe("swe-learning");
    expect(normalizeCentre("polymath learning")).toBe("polymath");
    expect(normalizeCentre("workouts")).toBe("workouts");
  });
});
