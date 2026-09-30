import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const directory = mkdtempSync(join(tmpdir(), "lifeos-usage-test-"));
vi.stubEnv("LIFEOS_DB_PATH", join(directory, "test.db"));
const { recordUsage, usageDay, usageRoute, usageSummary } = await import("./usage");
afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

describe("usage counter", () => {
  it("keeps at most two safe path segments and rejects anything else", () => {
    expect(usageRoute("/decide/approvals/abc?x=1")).toBe("/decide/approvals");
    expect(usageRoute("/")).toBe("/");
    expect(usageRoute("decide")).toBeNull();
    expect(usageRoute("/../etc")).toBeNull();
    expect(usageRoute("/decide/<script>")).toBeNull();
    expect(usageRoute(42)).toBeNull();
  });
  it("counts visits per route per day in the Paris day", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    expect(usageDay(new Date("2026-09-29T22:30:00Z"))).toBe("2026-09-30");
    expect(recordUsage("/finance", now)).toBe(true);
    recordUsage("/finance", now); recordUsage("/chat", now);
    expect(recordUsage("bad", now)).toBe(false);
    expect(usageSummary(7, now)).toEqual([
      { route: "/finance", visits: 2, days: 1, last: "2026-09-30" },
      { route: "/chat", visits: 1, days: 1, last: "2026-09-30" },
    ]);
  });
  it("leaves old days out of the window", () => {
    recordUsage("/status", new Date("2026-06-01T10:00:00Z"));
    expect(usageSummary(30, new Date("2026-09-30T10:00:00Z")).some((entry) => entry.route === "/status")).toBe(false);
  });
});
