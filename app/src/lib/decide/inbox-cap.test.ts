import { describe, expect, it } from "vitest";
import { capSavedItems } from "./inbox-cap";

const now = new Date("2026-09-30T12:00:00Z");
const item = (id: number, date: string) => ({ id: String(id), savedAt: date });

describe("capSavedItems", () => {
  it("shows at most ten fresh saved items and counts the hidden remainder", () => {
    const result = capSavedItems(Array.from({ length: 12 }, (_, i) => item(i, "2026-09-29T10:00:00Z")), now);
    expect(result.visible).toHaveLength(10);
    expect(result.capped).toBe(2);
    expect(result.expired).toBe(0);
  });

  it("hides items older than fourteen days without mutating the input", () => {
    const items = [item(1, "2026-09-16T11:59:59Z"), item(2, "2026-09-16T12:00:00Z")];
    const result = capSavedItems(items, now);
    expect(result.visible.map((x) => x.id)).toEqual(["2"]);
    expect(result.expired).toBe(1);
    expect(items).toHaveLength(2);
  });

  it("keeps undated records visible rather than silently losing them", () => {
    expect(capSavedItems([{ id: "legacy" }], now).visible).toEqual([{ id: "legacy" }]);
  });
});
