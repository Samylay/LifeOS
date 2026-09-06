// today-brief-rework ticket 03: the brief moves from an inherited constant
// (06:00) to a generation time tied to delivery (06:15 Paris, 15 min ahead of
// the 06:30 delivery). The two acceptance criteria this pins:
//   - restarting the app after generation time never produces a second brief
//     for the same date (no silent double-build);
//   - restarting after a MISSED generation time still produces that day's
//     brief on the next boot (catch-up), rather than skipping the day.
// runBrief()'s date-dedupe already implements both; this test asserts that
// behaviour directly against the filesystem rather than through the scheduler
// (which only wires timing, tested separately in tz.test.ts).
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
    ],
  };
});

const tmpOut = path.join(os.tmpdir(), `lifeos-run-brief-test-${process.pid}-${Date.now()}.json`);
process.env.BRIEF_OUT = tmpOut;

const { runBrief } = await import("./builder");

afterEach(() => {
  try {
    fs.unlinkSync(tmpOut);
  } catch {
    // already absent — fine
  }
});

describe("runBrief dedupe / catch-up", () => {
  it("builds when no brief exists on disk yet", async () => {
    const result = await runBrief();
    expect(result.ran).toBe(true);
    expect(result.brief?.cards.map((c) => c.id)).toEqual(["ok"]);
  });

  it("a second run the same day does not double-build", async () => {
    await runBrief();
    const second = await runBrief();
    expect(second.ran).toBe(false);
    expect(second.reason).toMatch(/already generated/);
  });

  it("force rebuilds even when today's brief already exists", async () => {
    await runBrief();
    const forced = await runBrief({ force: true });
    expect(forced.ran).toBe(true);
  });

  it("a stale brief on disk (missed generation) is replaced by today's on the next attempt", async () => {
    fs.mkdirSync(path.dirname(tmpOut), { recursive: true });
    fs.writeFileSync(
      tmpOut,
      JSON.stringify({ date: "2000-01-01", generated_at: "2000-01-01T06:15:00Z", cards: [] })
    );
    const result = await runBrief();
    expect(result.ran).toBe(true);
    expect(result.brief?.date).not.toBe("2000-01-01");
  });
});
