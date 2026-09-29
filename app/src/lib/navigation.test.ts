import { describe, it, expect } from "vitest";
import { activeDestination, NAV_ITEMS, surfaceTitle } from "./navigation";

describe("navigation destinations", () => {
  it("selects Inbox for its subroutes", () => {
    expect(activeDestination("/decide/approvals")?.href).toBe("/decide");
    expect(activeDestination("/decide/dispatch")?.href).toBe("/decide");
    expect(surfaceTitle("/decide/dispatch")).toBe("Inbox");
  });
  it("matches path segments rather than prefixes", () => {
    expect(activeDestination("/knowledge/teach/session")).toBeUndefined();
    expect(surfaceTitle("/knowledge/teach")).toBe("Teach");
    expect(surfaceTitle("/knowledge/teach/session")).toBe("Teach session");
    expect(activeDestination("/newsroom")).toBeUndefined();
    expect(activeDestination("/")?.href).toBe("/");
  });
  it("has one direct entry per destination", () => {
    expect(new Set(NAV_ITEMS.map((item) => item.href)).size).toBe(NAV_ITEMS.length);
    for (const href of ["/decide", "/finance", "/workouts", "/status"]) {
      expect(NAV_ITEMS.some((item) => item.href === href)).toBe(true);
    }
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Today", "Inbox", "Assistant", "Training", "Money", "System", "Settings",
    ]);
  });
  it("caps the route inventory at seven destinations", () => {
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(7);
  });
  it("maps subroutes to their owning destination", () => {
    expect(activeDestination("/decide/approvals")?.href).toBe("/decide");
    expect(surfaceTitle("/workflows")).toBe("Inbox");
    expect(surfaceTitle("/decide/dispatch")).toBe("Inbox");
  });
});
