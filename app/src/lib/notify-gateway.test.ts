import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Point the lazy singleton DB at a throwaway file before importing the module
// (mirrors the other server-db-backed tests).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-gateway-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { listDocs } = await import("@/lib/server-db");
const {
  toGatewayLevel,
  toPagerSeverity,
  isQuietHours,
  decidePush,
  isDuplicate,
  appendNotifyLog,
  DEFAULT_SETTINGS,
  LOG_COLLECTION,
} = await import("@/lib/notify-gateway");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("severity mapping (both vocabularies accepted)", () => {
  it("maps legacy pager severities to gateway levels", () => {
    expect(toGatewayLevel("page")).toBe("high");
    expect(toGatewayLevel("info")).toBe("normal");
    expect(toGatewayLevel("low")).toBe("low");
  });

  it("accepts the gateway vocabulary directly", () => {
    expect(toGatewayLevel("high")).toBe("high");
    expect(toGatewayLevel("normal")).toBe("normal");
  });

  it("round-trips legacy values so /pager storage is unchanged", () => {
    for (const s of ["page", "info", "low"] as const) {
      expect(toPagerSeverity(toGatewayLevel(s))).toBe(s);
    }
  });
});

describe("quiet hours (default 23:00-07:00, Europe/Paris unless BRIEF_TZ says otherwise)", () => {
  // Paris is UTC+2 in July (CEST): 23:30 Paris == 21:30 UTC.
  const s = { ...DEFAULT_SETTINGS, tz: "Europe/Paris" };
  it("defaults to the deployment's timezone, not the one Samy has left", () => {
    expect(DEFAULT_SETTINGS.tz).toBe(process.env.BRIEF_TZ || "Europe/Paris");
    expect(DEFAULT_SETTINGS.tz).not.toBe("Asia/Tokyo");
  });

  it("is quiet overnight and awake in the day, across the midnight wrap", () => {
    expect(isQuietHours(new Date("2026-07-21T21:30:00Z"), s)).toBe(true); // 23:30 Paris
    expect(isQuietHours(new Date("2026-07-22T01:00:00Z"), s)).toBe(true); // 03:00 Paris
    expect(isQuietHours(new Date("2026-07-22T04:59:00Z"), s)).toBe(true); // 06:59 Paris
    expect(isQuietHours(new Date("2026-07-22T05:00:00Z"), s)).toBe(false); // 07:00 Paris (end exclusive)
    expect(isQuietHours(new Date("2026-07-21T10:00:00Z"), s)).toBe(false); // 12:00 Paris
    expect(isQuietHours(new Date("2026-07-21T20:59:00Z"), s)).toBe(false); // 22:59 Paris
    expect(isQuietHours(new Date("2026-07-21T21:00:00Z"), s)).toBe(true); // 23:00 Paris (start inclusive)
  });

  // The exact window the old Asia/Tokyo default silenced: a late Paris
  // afternoon was 23:00-01:00 in Tokyo, so normal pushes died mid-day.
  it("no longer treats a Paris afternoon as quiet", () => {
    expect(isQuietHours(new Date("2026-07-21T15:00:00Z"), s)).toBe(false); // 17:00 Paris
    expect(isQuietHours(new Date("2026-07-21T15:00:00Z"), { ...s, tz: "Asia/Tokyo" })).toBe(true); // 00:00 JST
  });

  it("handles a same-day window and the disabled case", () => {
    const day = { ...s, quietStart: "12:00", quietEnd: "14:00" };
    expect(isQuietHours(new Date("2026-07-21T11:00:00Z"), day)).toBe(true); // 13:00 Paris
    expect(isQuietHours(new Date("2026-07-21T13:00:00Z"), day)).toBe(false); // 15:00 Paris
    const off = { ...s, quietStart: "23:00", quietEnd: "23:00" };
    expect(isQuietHours(new Date("2026-07-21T21:30:00Z"), off)).toBe(false);
  });
});

describe("push routing", () => {
  const s = { ...DEFAULT_SETTINGS, tz: "Europe/Paris" };
  it("high pushes always, even in quiet hours", () => {
    expect(decidePush("high", false, s, 1)).toBe("send");
    expect(decidePush("high", true, s, 1)).toBe("send");
  });

  it("low never pushes", () => {
    expect(decidePush("low", false, { ...s, pushNormal: true }, 1)).toBe("skipped");
  });

  it("normal pushes only with pushNormal on and outside quiet hours", () => {
    expect(decidePush("normal", false, s, 1)).toBe("skipped"); // default off
    expect(decidePush("normal", false, { ...s, pushNormal: true }, 1)).toBe("send");
    expect(decidePush("normal", true, { ...s, pushNormal: true }, 1)).toBe("quiet");
  });

  it("reports no-subs when nothing is registered", () => {
    expect(decidePush("high", false, s, 0)).toBe("no-subs");
  });
});

describe("dedupe (identical title+text within 10 minutes)", () => {
  const delivered = { pager: "delivered", push: "skipped" } as const;

  it("collapses a repeat within the window, but not after it", () => {
    const t0 = new Date("2026-07-21T00:00:00Z");
    expect(isDuplicate("backup", "backup ok", t0)).toBe(false);
    appendNotifyLog(
      { title: "backup", text: "backup ok", severity: "normal", source: null, channels: delivered },
      t0
    );
    expect(isDuplicate("backup", "backup ok", new Date(t0.getTime() + 5 * 60_000))).toBe(true);
    expect(isDuplicate("backup", "backup ok", new Date(t0.getTime() + 11 * 60_000))).toBe(false);
  });

  it("distinguishes title and text", () => {
    const t0 = new Date("2026-07-21T01:00:00Z");
    appendNotifyLog(
      { title: "a", text: "same", severity: "normal", source: null, channels: delivered },
      t0
    );
    expect(isDuplicate("b", "same", new Date(t0.getTime() + 60_000))).toBe(false);
    expect(isDuplicate("a", "different", new Date(t0.getTime() + 60_000))).toBe(false);
  });

  it("a deduped log row does not extend the window", () => {
    const t0 = new Date("2026-07-21T02:00:00Z");
    const dd = { pager: "deduped", push: "deduped" } as const;
    appendNotifyLog(
      { title: "x", text: "y", severity: "normal", source: null, channels: delivered },
      t0
    );
    appendNotifyLog(
      { title: "x", text: "y", severity: "normal", source: null, channels: dd },
      new Date(t0.getTime() + 9 * 60_000)
    );
    // 12 min after the DELIVERY (3 min after the deduped row): window reopened.
    expect(isDuplicate("x", "y", new Date(t0.getTime() + 12 * 60_000))).toBe(false);
  });
});

describe("notifyLog retention", () => {
  it("prunes entries older than 30 days on write", () => {
    const old = new Date("2026-05-01T00:00:00Z");
    const now = new Date("2026-07-21T03:00:00Z");
    const ch = { pager: "delivered", push: "skipped" } as const;
    appendNotifyLog({ title: "ancient", text: "old", severity: "low", source: null, channels: ch }, old);
    appendNotifyLog({ title: "fresh", text: "new", severity: "low", source: null, channels: ch }, now);
    const titles = listDocs(LOG_COLLECTION).map((d) => d.title);
    expect(titles).not.toContain("ancient");
    expect(titles).toContain("fresh");
  });
});
