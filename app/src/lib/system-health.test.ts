import { describe, expect, it } from "vitest";
import { mapSystemTopology } from "./system-health";

describe("system topology", () => {
  it("includes uncurated and stopped containers with only observed networks", () => {
    expect(mapSystemTopology([
      { Names: ["/custom-worker"], State: "exited", Status: "Exited (1)", NetworkSettings: { Networks: { jobs: {}, shared: {} } } },
      { Names: ["/lifeos"], State: "running", Status: "Up 3 hours", NetworkSettings: { Networks: { shared: {} } } },
    ])).toEqual([
      { name: "custom-worker", label: "custom-worker", state: "exited", status: "Exited (1)", networks: ["jobs", "shared"] },
      { name: "lifeos", label: "LifeOS app", state: "running", status: "Up 3 hours", networks: ["shared"] },
    ]);
  });
  it("does not invent connectivity or state for incomplete observations", () => {
    expect(mapSystemTopology([{}, { Names: ["/isolated"] }])).toEqual([
      { name: "isolated", label: "isolated", state: "unknown", status: "", networks: [] },
    ]);
  });
});
