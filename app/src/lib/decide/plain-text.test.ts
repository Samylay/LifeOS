import { describe, it, expect } from "vitest";
import { excerpt, plainTitle } from "./plain-text";

describe("plainTitle", () => {
  it("strips markdown so a title reads as words", () => {
    expect(plainTitle("T85 — ship the **private** `Instagram` archive (`/instagram`)")).toBe("T85 — ship the private Instagram archive (/instagram)");
    expect(plainTitle("See [the doc](https://example.com/x) now")).toBe("See the doc now");
    expect(plainTitle("# Heading\n\nbody  text")).toBe("Heading body text");
  });
  it("drops fenced code", () => {
    expect(plainTitle("Run this ```rm -rf /``` never")).toBe("Run this never");
  });
});

describe("excerpt", () => {
  it("keeps short text whole", () => {
    expect(excerpt("Short request.")).toBe("Short request.");
  });
  it("cuts long text at a sentence or word boundary and marks it", () => {
    const text = "First sentence is here. " + "word ".repeat(80);
    const out = excerpt(text, 120);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith("…") || out.endsWith(".")).toBe(true);
    expect(out.startsWith("First sentence is here.")).toBe(true);
  });
});
