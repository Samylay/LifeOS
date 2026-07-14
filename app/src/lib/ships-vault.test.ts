import { describe, it, expect } from "vitest";
import { formatShipsNote } from "./ships-vault";

describe("formatShipsNote", () => {
  it("renders frontmatter with aggregated sorted tags and one line per ship", () => {
    const note = formatShipsNote("2026-07-13", [
      { what: "Shipped the thing", toWhom: "self (LifeOS)", tags: ["lifeos", "infra"] },
      { what: "Posted writeup", toWhom: "public", tags: ["content"] },
    ]);
    expect(note).toContain("date: 2026-07-13");
    expect(note).toContain("tags: [content, infra, lifeos]");
    expect(note).toContain("# Ships — 2026-07-13");
    expect(note).toContain("- **Shipped the thing** → self (LifeOS) #lifeos #infra");
    expect(note).toContain("- **Posted writeup** → public #content");
  });

  it("handles untagged ships", () => {
    const note = formatShipsNote("2026-07-13", [{ what: "A ship", toWhom: "someone", tags: [] }]);
    expect(note).toContain("tags: []");
    expect(note).toContain("- **A ship** → someone\n");
  });
});
