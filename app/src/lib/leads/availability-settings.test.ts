import { describe, it, expect } from "vitest";
import { parseAvailability, DEFAULT_AVAILABILITY } from "./availability-settings";

describe("parseAvailability — default OFF, tolerant of whatever's actually stored", () => {
  it("no settings doc yet -> default availability (openToWork: false)", () => {
    expect(parseAvailability(null)).toEqual(DEFAULT_AVAILABILITY);
  });

  it("openToWork must be exactly `true` to switch on — any other value is OFF", () => {
    expect(parseAvailability({ openToWork: "true" }).openToWork).toBe(false);
    expect(parseAvailability({ openToWork: 1 }).openToWork).toBe(false);
    expect(parseAvailability({}).openToWork).toBe(false);
  });

  it("openToWork: true reads through as on", () => {
    expect(parseAvailability({ openToWork: true }).openToWork).toBe(true);
  });

  it("reads a stored `{ __date }` marker for unavailableUntil", () => {
    const a = parseAvailability({ openToWork: true, unavailableUntil: { __date: "2026-09-10T00:00:00.000Z" } });
    expect(a.unavailableUntil?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("a missing unavailableUntil is null, not undefined", () => {
    expect(parseAvailability({ openToWork: true }).unavailableUntil).toBeNull();
  });
});
