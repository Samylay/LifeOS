import { describe, it, expect } from "vitest";
import { IDEA_STATUSES, NEXT_STATUS, migrateStatus, needsStatusMigration } from "./idea-status";

describe("migrateStatus — the 18 ideas migrate, nothing is reset", () => {
  it("maps the live bank: 17 idea stay idea, the one scripted becomes ready", () => {
    expect(migrateStatus("idea")).toBe("idea");
    expect(migrateStatus("scripted")).toBe("ready");
  });

  it("maps the two stages that were never once used", () => {
    // No instances exist, but a tolerant read costs nothing and a dropped
    // row costs an idea.
    expect(migrateStatus("recorded")).toBe("ready");
    expect(migrateStatus("edited")).toBe("ready");
  });

  it("keeps posted as posted", () => {
    expect(migrateStatus("posted")).toBe("posted");
  });

  it("is idempotent — migrating twice changes nothing", () => {
    for (const s of ["idea", "scripted", "recorded", "edited", "posted"]) {
      const once = migrateStatus(s);
      expect(migrateStatus(once)).toBe(once);
    }
  });

  it("falls back to idea rather than dropping a row it does not recognise", () => {
    expect(migrateStatus(undefined)).toBe("idea");
    expect(migrateStatus("")).toBe("idea");
    expect(migrateStatus("something-nobody-remembers")).toBe("idea");
  });

  it("only ever returns one of the three states", () => {
    const allowed = IDEA_STATUSES.map((s) => s.status);
    for (const s of ["idea", "scripted", "recorded", "edited", "posted", "junk", ""]) {
      expect(allowed).toContain(migrateStatus(s));
    }
  });
});

describe("needsStatusMigration — only touches rows that actually need it", () => {
  it("is true for a legacy status and false for a current one", () => {
    expect(needsStatusMigration({ status: "scripted" } as never)).toBe(true);
    expect(needsStatusMigration({ status: "idea" } as never)).toBe(false);
    expect(needsStatusMigration({ status: "ready" } as never)).toBe(false);
    expect(needsStatusMigration({ status: "posted" } as never)).toBe(false);
  });
});

describe("NEXT_STATUS — the advance path reflects what Samy actually does", () => {
  it("goes idea → ready → posted and stops", () => {
    expect(NEXT_STATUS.idea?.next).toBe("ready");
    expect(NEXT_STATUS.ready?.next).toBe("posted");
    expect(NEXT_STATUS.posted).toBeUndefined();
  });

  it("ready means I could film this now", () => {
    expect(NEXT_STATUS.idea?.label).toMatch(/film/i);
  });
});
