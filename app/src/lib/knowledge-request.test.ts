import { describe, expect, it } from "vitest";
import { createRequestGate, isAbortError } from "./knowledge-request";

describe("knowledge request gate", () => {
  it("rejects a late response from an older search", () => {
    const gate = createRequestGate();
    const first = gate.start();
    const second = gate.start();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("recognizes abort errors without treating them as a failed knowledge request", () => {
    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("network down"))).toBe(false);
  });
});
