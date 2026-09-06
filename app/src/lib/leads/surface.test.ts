import { describe, it, expect } from "vitest";
import { toAdmissionCandidate, selectAdmittedLeads, lastDeliveredAt, type RawLeadDoc } from "./surface";
import type { Availability } from "./admission";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const AVAILABLE: Availability = { openToWork: true, unavailableUntil: null };
const OFF: Availability = { openToWork: false, unavailableUntil: null };

function rawLead(overrides: Partial<RawLeadDoc> = {}): RawLeadDoc {
  return {
    id: "lead-1",
    status: "new",
    source: "codeur",
    postedAt: { __date: "2026-09-01T00:00:00.000Z" },
    counterparty: "Acme Corp",
    requirement: "a Next.js dashboard",
    budgetFloor: 2000,
    createdAt: { __date: "2026-09-01T00:05:00.000Z" },
    ...overrides,
  };
}

describe("toAdmissionCandidate — raw stored doc -> admission's contract", () => {
  it("reads a `{ __date }` marker for postedAt and deadline", () => {
    const c = toAdmissionCandidate(
      rawLead({ deadline: { __date: "2026-09-10T00:00:00.000Z" } }),
      NOW,
    );
    expect(c.postedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(c.deadline?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("every lead in the live collection lacks a deadline today, and that maps to null — not a fallback default", () => {
    const c = toAdmissionCandidate(rawLead(), NOW);
    expect(c.deadline).toBeNull();
  });

  it("falls back postedAt to `now` when the doc has none, rather than throwing or admitting a bad date", () => {
    const c = toAdmissionCandidate(rawLead({ postedAt: undefined }), NOW);
    expect(c.postedAt.getTime()).toBe(NOW.getTime());
  });

  it("falls back counterparty/requirement to title/categories when the richer fields (ticket 03) aren't there yet", () => {
    const c = toAdmissionCandidate(
      rawLead({ counterparty: undefined, requirement: undefined, title: "Need a website", categories: "web" }),
      NOW,
    );
    expect(c.counterparty).toBe("Need a website");
    expect(c.requirement).toBe("web");
  });

  it("a non-numeric or missing budgetFloor becomes 0, never NaN or undefined", () => {
    const c = toAdmissionCandidate(rawLead({ budgetFloor: undefined }), NOW);
    expect(c.budgetFloor).toBe(0);
  });
});

describe("selectAdmittedLeads — the fetch-boundary cap", () => {
  it("never returns more than the cap even when far more candidates are actionable", () => {
    const deadline = { __date: "2026-09-10T00:00:00.000Z" };
    const rows = Array.from({ length: 20 }, (_, i) => rawLead({ id: `lead-${i}`, deadline }));
    const admitted = selectAdmittedLeads(rows, NOW, AVAILABLE, 5);
    expect(admitted).toHaveLength(5);
  });

  it("with nothing actionable, returns an empty array rather than falling back to something", () => {
    expect(selectAdmittedLeads([rawLead()], NOW, AVAILABLE)).toEqual([]);
  });

  it("a lead already contacted, won or passed never occupies a slot, even if it would otherwise be actionable", () => {
    const deadline = { __date: "2026-09-10T00:00:00.000Z" };
    const rows = [
      rawLead({ id: "contacted-1", status: "contacted", deadline }),
      rawLead({ id: "won-1", status: "won", deadline }),
      rawLead({ id: "passed-1", status: "passed", deadline }),
      rawLead({ id: "new-1", status: "new", deadline }),
    ];
    const admitted = selectAdmittedLeads(rows, NOW, AVAILABLE, 5);
    expect(admitted.map((a) => a.id)).toEqual(["new-1"]);
  });

  it("Samy unavailable empties the surface even when every lead is otherwise actionable", () => {
    const deadline = { __date: "2026-09-10T00:00:00.000Z" };
    const rows = [rawLead({ deadline })];
    expect(selectAdmittedLeads(rows, NOW, OFF)).toEqual([]);
  });

  it("today's 732-row unpurged backlog (no deadlines, all `new`) admits nothing even when Samy is available", () => {
    const rows = Array.from({ length: 50 }, (_, i) => rawLead({ id: `legacy-${i}` }));
    expect(selectAdmittedLeads(rows, NOW, AVAILABLE)).toEqual([]);
  });
});

describe("lastDeliveredAt", () => {
  it("is the most recent createdAt across all rows, admitted or not", () => {
    const rows = [
      rawLead({ id: "a", createdAt: { __date: "2026-09-01T00:00:00.000Z" } }),
      rawLead({ id: "b", createdAt: { __date: "2026-09-05T08:00:00.000Z" } }),
      rawLead({ id: "c", createdAt: { __date: "2026-09-03T00:00:00.000Z" } }),
    ];
    expect(lastDeliveredAt(rows)?.toISOString()).toBe("2026-09-05T08:00:00.000Z");
  });

  it("is null when the collection has never received a lead", () => {
    expect(lastDeliveredAt([])).toBeNull();
  });
});
