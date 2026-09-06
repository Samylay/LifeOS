import { describe, it, expect } from "vitest";
import {
  PASS_REASONS,
  isPassReason,
  buildPassUpdate,
  LEAD_OUTCOMES,
  isLeadOutcome,
  buildOutcomeUpdate,
  selectPassRecords,
  type PassedLeadDoc,
} from "./outcomes";
import { parseStoredDate } from "./dates";

const NOW = new Date("2026-09-07T12:00:00.000Z");

describe("PASS_REASONS — a closed set, never free text", () => {
  it("accepts every listed reason", () => {
    for (const r of PASS_REASONS) expect(isPassReason(r)).toBe(true);
  });

  it("rejects anything outside the set, including arbitrary free text", () => {
    expect(isPassReason("client seemed rude")).toBe(false);
    expect(isPassReason("")).toBe(false);
    expect(isPassReason(undefined)).toBe(false);
    expect(isPassReason(42)).toBe(false);
  });
});

describe("buildPassUpdate", () => {
  it("records the status transition, the reason, and the date together", () => {
    expect(buildPassUpdate("budget-too-low", NOW)).toEqual({
      status: "passed",
      passReason: "budget-too-low",
      passedAt: NOW,
    });
  });

  it("refuses a reason outside the closed set rather than storing it", () => {
    // @ts-expect-error — exercising the runtime guard against a value TS wouldn't allow anyway
    expect(() => buildPassUpdate("client seemed rude", NOW)).toThrow();
  });
});

describe("LEAD_OUTCOMES / buildOutcomeUpdate — each outcome stamps its own date", () => {
  it("contacted stamps contactedAt only", () => {
    expect(buildOutcomeUpdate("contacted", NOW)).toEqual({ status: "contacted", contactedAt: NOW });
  });

  it("won stamps wonAt only", () => {
    expect(buildOutcomeUpdate("won", NOW)).toEqual({ status: "won", wonAt: NOW });
  });

  it("lost stamps lostAt only", () => {
    expect(buildOutcomeUpdate("lost", NOW)).toEqual({ status: "lost", lostAt: NOW });
  });

  it("every outcome round-trips through isLeadOutcome", () => {
    for (const o of LEAD_OUTCOMES) expect(isLeadOutcome(o)).toBe(true);
  });

  it("rejects an outcome outside the set", () => {
    expect(isLeadOutcome("ghosted")).toBe(false);
    // @ts-expect-error — exercising the runtime guard
    expect(() => buildOutcomeUpdate("ghosted", NOW)).toThrow();
  });
});

describe("selectPassRecords — bulk retrieval for an outside caller (scout's filter)", () => {
  function doc(overrides: Partial<PassedLeadDoc> = {}): PassedLeadDoc {
    return {
      id: "lead-1",
      status: "passed",
      source: "codeur",
      passReason: "budget-too-low",
      passedAt: { __date: "2026-09-07T09:00:00.000Z" },
      ...overrides,
    };
  }

  it("returns a passed row's reason, source and date", () => {
    const records = selectPassRecords([doc()], parseStoredDate);
    expect(records).toEqual([
      { id: "lead-1", source: "codeur", reason: "budget-too-low", passedAt: new Date("2026-09-07T09:00:00.000Z") },
    ]);
  });

  it("excludes rows that are not passed", () => {
    expect(selectPassRecords([doc({ status: "new" }), doc({ status: "contacted" })], parseStoredDate)).toEqual([]);
  });

  it("excludes a passed row missing a valid reason — never fabricates one", () => {
    expect(selectPassRecords([doc({ passReason: undefined })], parseStoredDate)).toEqual([]);
    expect(selectPassRecords([doc({ passReason: "made this up" })], parseStoredDate)).toEqual([]);
  });

  it("a missing/unparseable passedAt reads as null, not a fabricated date", () => {
    const records = selectPassRecords([doc({ passedAt: undefined })], parseStoredDate);
    expect(records[0].passedAt).toBeNull();
  });

  it("many rows in, only the passed-with-reason ones out, in order", () => {
    const rows = [
      doc({ id: "a", status: "new" }),
      doc({ id: "b", passReason: "not-a-fit" }),
      doc({ id: "c", status: "won" }),
      doc({ id: "d", passReason: "no-capacity" }),
    ];
    expect(selectPassRecords(rows, parseStoredDate).map((r) => r.id)).toEqual(["b", "d"]);
  });
});
