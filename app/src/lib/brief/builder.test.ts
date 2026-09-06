// Error isolation is an acceptance criterion for today-brief-rework 01: one
// broken fetcher must cost one card, never the whole brief. The builder
// already implements this (buildBrief's try/catch per fetcher); this test
// pins the behaviour against the REGISTRY contract rather than rendering.
import { describe, it, expect, vi } from "vitest";

vi.mock("./registry", async () => {
  const actual = await vi.importActual<typeof import("./registry")>("./registry");
  return {
    ...actual,
    REGISTRY: [
      {
        fetch: async () =>
          actual.card({ id: "ok", type: "ok", priority: "action", status: "green", title: "OK", body: {} }),
        meta: { id: "ok", type: "ok", priority: "action", title: "OK" },
      },
      {
        fetch: async () => {
          throw new Error("boom");
        },
        meta: { id: "broken", type: "broken", priority: "state", title: "Broken" },
      },
      {
        fetch: async () =>
          actual.card({ id: "after", type: "after", priority: "state", status: "neutral", title: "After", body: {} }),
        meta: { id: "after", type: "after", priority: "state", title: "After" },
      },
    ],
  };
});

const { buildBrief } = await import("./builder");

describe("buildBrief error isolation", () => {
  it("a throwing fetcher becomes one error card, and every other card still builds", async () => {
    const brief = await buildBrief();

    expect(brief.cards.map((c) => c.id)).toEqual(["ok", "broken", "after"]);

    const ok = brief.cards.find((c) => c.id === "ok")!;
    expect(ok.error).toBeNull();
    expect(ok.status).toBe("green");

    const broken = brief.cards.find((c) => c.id === "broken")!;
    expect(broken.error).toBe("boom");
    expect(broken.status).toBe("neutral");
    expect(broken.title).toBe("Broken");

    const after = brief.cards.find((c) => c.id === "after")!;
    expect(after.error).toBeNull();
    expect(after.status).toBe("neutral");
  });
});
