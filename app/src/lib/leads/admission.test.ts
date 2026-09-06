import { describe, it, expect } from "vitest";
import {
  ADMISSION_CAP,
  isActionable,
  admissionReason,
  admit,
  type AdmissionCandidate,
  type Availability,
} from "./admission";

const NOW = new Date("2026-09-06T12:00:00.000Z");

const AVAILABLE: Availability = { openToWork: true, unavailableUntil: null };
const OFF: Availability = { openToWork: false, unavailableUntil: null };

function candidate(overrides: Partial<AdmissionCandidate> = {}): AdmissionCandidate {
  return {
    id: "lead-1",
    source: "codeur",
    postedAt: new Date("2026-09-01T00:00:00.000Z"),
    deadline: new Date("2026-09-10T00:00:00.000Z"),
    counterparty: "Acme Corp",
    requirement: "a Next.js dashboard",
    budgetFloor: 2000,
    ...overrides,
  };
}

describe("isActionable — table-driven across deadline × availability", () => {
  it("a lead posted inside its deadline, with Samy available, is admitted", () => {
    expect(isActionable(candidate(), NOW, AVAILABLE)).toBe(true);
  });

  it("the same lead is not admitted once its deadline has passed — no sweep, just a different `now`", () => {
    // This is the whole point of "expiry is derived, not stored": nothing has
    // to run at midnight to retire this lead. The next read of `now` does it.
    const c = candidate({ deadline: new Date("2026-09-05T23:59:59.999Z") });
    expect(isActionable(c, NOW, AVAILABLE)).toBe(false);
  });

  it("a deadline exactly at `now` is still admitted — the boundary is inclusive", () => {
    const c = candidate({ deadline: NOW });
    expect(isActionable(c, NOW, AVAILABLE)).toBe(true);
  });

  it("a deadline one millisecond before `now` is not admitted — the other side of the same boundary", () => {
    const c = candidate({ deadline: new Date(NOW.getTime() - 1) });
    expect(isActionable(c, NOW, AVAILABLE)).toBe(false);
  });

  it("a lead is withheld while Samy is unavailable, even within its own deadline", () => {
    expect(isActionable(candidate(), NOW, OFF)).toBe(false);
  });

  it("the global switch defaulting off means nothing is admitted until it is turned on", () => {
    // Ticket decision (2026-09-06): availability is a single settings switch,
    // default off. An all-else-perfect candidate must still be withheld.
    const perfect = candidate({ deadline: new Date("2099-01-01") });
    expect(isActionable(perfect, NOW, OFF)).toBe(false);
  });

  it("a lead is admitted again once an `unavailableUntil` snooze has passed", () => {
    const snoozedPast = { openToWork: true, unavailableUntil: new Date("2026-09-06T11:59:59.999Z") };
    expect(isActionable(candidate(), NOW, snoozedPast)).toBe(true);
  });

  it("a lead stays withheld while an `unavailableUntil` snooze is still in the future", () => {
    const snoozedFuture = { openToWork: true, unavailableUntil: new Date("2026-09-06T12:00:00.001Z") };
    expect(isActionable(candidate(), NOW, snoozedFuture)).toBe(false);
  });

  it("an `unavailableUntil` exactly at `now` counts as available — boundary is inclusive here too", () => {
    const snoozedNow = { openToWork: true, unavailableUntil: NOW };
    expect(isActionable(candidate(), NOW, snoozedNow)).toBe(true);
  });

  it("a lead with no deadline is withheld — an explicit decision, not a fallthrough to admitted", () => {
    // A lead with no known deadline can never expire on its own, which is
    // exactly the mechanism that produced the 653-item graveyard: nothing
    // ever ages out. Treating "unknown deadline" as "not actionable" keeps
    // expiry structural instead of relying on the field always being filled.
    const c = candidate({ deadline: null });
    expect(isActionable(c, NOW, AVAILABLE)).toBe(false);
  });

  it("a posting dated in the future is not actionable yet — it hasn't gone live", () => {
    const c = candidate({ postedAt: new Date("2026-09-07T00:00:00.000Z") });
    expect(isActionable(c, NOW, AVAILABLE)).toBe(false);
  });
});

describe("admissionReason — the one line the card shows", () => {
  it("names who they are and what they need", () => {
    const reason = admissionReason(candidate());
    expect(reason).toContain("Acme Corp");
    expect(reason).toContain("a Next.js dashboard");
  });

  it("is a non-empty phrase for a lead with no deadline too — reason text doesn't assume admission", () => {
    const reason = admissionReason(candidate({ deadline: null }));
    expect(reason.length).toBeGreaterThan(0);
  });
});

describe("admit — the cap is enforced in one place", () => {
  it("with nothing admissible, the result is empty — never a fallback to showing something anyway", () => {
    const candidates = [candidate({ id: "a" }), candidate({ id: "b", deadline: null })];
    expect(admit(candidates, [], ADMISSION_CAP, NOW, OFF)).toEqual([]);
  });

  it("given more admissible leads than the cap, exactly the cap comes back", () => {
    const candidates = Array.from({ length: ADMISSION_CAP + 5 }, (_, i) =>
      candidate({ id: `lead-${i}`, deadline: new Date(`2026-09-${10 + i}T00:00:00.000Z`) }),
    );
    const result = admit(candidates, [], ADMISSION_CAP, NOW, AVAILABLE);
    expect(result).toHaveLength(ADMISSION_CAP);
  });

  it("the same input always yields the same selection — deterministic, not random", () => {
    const candidates = Array.from({ length: ADMISSION_CAP + 5 }, (_, i) =>
      candidate({ id: `lead-${i}`, deadline: new Date(`2026-09-${10 + i}T00:00:00.000Z`) }),
    );
    const first = admit(candidates, [], ADMISSION_CAP, NOW, AVAILABLE);
    const second = admit(candidates, [], ADMISSION_CAP, NOW, AVAILABLE);
    expect(second).toEqual(first);
  });

  it("picks the soonest deadlines first — the ones that stop being actionable soonest", () => {
    const soon = candidate({ id: "soon", deadline: new Date("2026-09-07T00:00:00.000Z") });
    const later = candidate({ id: "later", deadline: new Date("2026-09-20T00:00:00.000Z") });
    const result = admit([later, soon], [], 1, NOW, AVAILABLE);
    expect(result.map((r) => r.id)).toEqual(["soon"]);
  });

  it("never returns a lead that failed isActionable, even under the cap", () => {
    const candidates = [candidate({ id: "expired", deadline: new Date("2026-01-01") }), candidate({ id: "no-deadline", deadline: null })];
    expect(admit(candidates, [], ADMISSION_CAP, NOW, AVAILABLE)).toEqual([]);
  });

  it("every admitted lead carries a short reason phrased for a human", () => {
    const result = admit([candidate({ id: "a" })], [], ADMISSION_CAP, NOW, AVAILABLE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "a", reason: expect.stringContaining("Acme Corp") });
  });

  it("a cap of 0 admits nothing, however many candidates qualify", () => {
    const candidates = [candidate({ id: "a" }), candidate({ id: "b" })];
    expect(admit(candidates, [], 0, NOW, AVAILABLE)).toEqual([]);
  });
});
