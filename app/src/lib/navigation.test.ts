import { describe, it, expect } from "vitest";
import { activeDestination, NAV_ITEMS, surfaceTitle } from "./navigation";

describe("navigation destinations", () => {
  it("selects Approvals without also selecting Decide", () => {
    expect(activeDestination("/decide/approvals")?.href).toBe("/decide/approvals");
    expect(activeDestination("/decide/dispatch")?.href).toBe("/decide");
    expect(surfaceTitle("/decide/dispatch")).toBe("Send to Claude");
  });
  it("matches path segments rather than prefixes", () => {
    expect(activeDestination("/knowledge/teach/session")?.href).toBe("/knowledge");
    expect(activeDestination("/newsroom")).toBeUndefined();
    expect(activeDestination("/")?.href).toBe("/");
  });
  it("has one direct entry per destination", () => {
    expect(new Set(NAV_ITEMS.map((item) => item.href)).size).toBe(NAV_ITEMS.length);
    for (const href of ["/decide/approvals", "/voice", "/knowledge", "/finance", "/workouts", "/status"]) {
      expect(NAV_ITEMS.some((item) => item.href === href)).toBe(true);
    }
  });
});
