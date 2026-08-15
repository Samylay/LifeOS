// Fixtures are invented. This repo's remote is public and the finance section's
// first standing rule is that no real amount, merchant or balance lands in a
// commit — including in a test.
import { describe, it, expect } from "vitest";
import {
  computeTotals,
  habitLines,
  monthlyAmount,
  parseFlowLine,
  parseFlowList,
  spendByKind,
  subscriptions,
  yearlyAmount,
  type FinanceFlow,
  type FinanceFlowDraft,
} from "./finance";

function flow(over: Partial<FinanceFlow> & { label: string; amount: number }): FinanceFlow {
  return {
    id: over.label,
    direction: "out",
    cadence: "monthly",
    kind: "sub",
    createdAt: new Date("2026-08-15"),
    ...over,
  };
}

describe("cadence normalisation", () => {
  it("converts every cadence to a monthly run-rate", () => {
    expect(monthlyAmount({ amount: 12, cadence: "monthly" })).toBe(12);
    expect(monthlyAmount({ amount: 120, cadence: "yearly" })).toBe(10);
    expect(monthlyAmount({ amount: 30, cadence: "quarterly" })).toBe(10);
    expect(monthlyAmount({ amount: 12, cadence: "weekly" })).toBeCloseTo(52, 5);
  });

  it("keeps one-offs out of the run-rate but counts them once per year", () => {
    expect(monthlyAmount({ amount: 400, cadence: "oneoff" })).toBe(0);
    expect(yearlyAmount({ amount: 400, cadence: "oneoff" })).toBe(400);
    expect(yearlyAmount({ amount: 25, cadence: "monthly" })).toBe(300);
  });
});

describe("computeTotals", () => {
  const flows = [
    flow({ label: "Bourse", amount: 450, direction: "in", kind: "fixed" }),
    flow({ label: "Loyer", amount: 520, kind: "fixed" }),
    flow({ label: "Gym", amount: 25, kind: "sub" }),
    flow({ label: "Adobe", amount: 71.88, cadence: "yearly", kind: "sub", dormant: true }),
    flow({ label: "Courses", amount: 200, kind: "variable" }),
  ];

  it("splits outgoings by kind and reports what is left", () => {
    const t = computeTotals(flows);
    expect(t.monthlyIn).toBe(450);
    expect(t.monthlyFixed).toBe(520);
    expect(t.monthlySubs).toBeCloseTo(25 + 71.88 / 12, 5);
    expect(t.monthlyVariable).toBe(200);
    expect(t.monthlyOut).toBeCloseTo(520 + 25 + 71.88 / 12 + 200, 5);
    expect(t.monthlyLeft).toBeCloseTo(450 - t.monthlyOut, 5);
  });

  it("prices dormant subscriptions per year", () => {
    expect(computeTotals(flows).dormantYearly).toBeCloseTo(71.88, 5);
  });

  it("returns zeroes rather than NaN on an empty list", () => {
    const t = computeTotals([]);
    expect(t.monthlyOut).toBe(0);
    expect(t.monthlyLeft).toBe(0);
    expect(spendByKind([])).toEqual([]);
  });
});

describe("subscriptions", () => {
  it("lists only cancellable recurring outgoings, dormant first then dearest", () => {
    const flows = [
      flow({ label: "Loyer", amount: 520, kind: "fixed" }),
      flow({ label: "Bourse", amount: 450, direction: "in", kind: "fixed" }),
      flow({ label: "Spotify", amount: 11.99, kind: "sub" }),
      flow({ label: "Gym", amount: 25, kind: "sub" }),
      flow({ label: "Adobe", amount: 12, kind: "sub", dormant: true }),
      flow({ label: "Concert", amount: 40, cadence: "oneoff", kind: "sub" }),
    ];
    expect(subscriptions(flows).map((f) => f.label)).toEqual(["Adobe", "Gym", "Spotify"]);
  });
});

describe("habitLines", () => {
  it("says nothing when there is nothing to say", () => {
    expect(habitLines([])).toEqual([]);
  });

  it("names the dormant subscription to cancel first", () => {
    const lines = habitLines([
      flow({ label: "Bourse", amount: 800, direction: "in", kind: "fixed" }),
      flow({ label: "Loyer", amount: 520, kind: "fixed" }),
      flow({ label: "Adobe", amount: 20, kind: "sub", dormant: true }),
    ]);
    expect(lines.some((l) => l.includes("Cancel Adobe first"))).toBe(true);
  });

  it("flags a month that does not close", () => {
    const lines = habitLines([
      flow({ label: "Bourse", amount: 300, direction: "in", kind: "fixed" }),
      flow({ label: "Loyer", amount: 520, kind: "fixed" }),
    ]);
    expect(lines.some((l) => l.includes("short each month"))).toBe(true);
  });

  it("never returns more than three lines", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      flow({ label: `Sub ${i}`, amount: 10, kind: "sub", dormant: true })
    );
    expect(habitLines([flow({ label: "In", amount: 900, direction: "in", kind: "fixed" }), ...many]).length).toBeLessThanOrEqual(3);
  });
});

describe("parseFlowLine", () => {
  const draft = (line: string): FinanceFlowDraft => {
    const parsed = parseFlowLine(line);
    if (!parsed.flow) throw new Error(`expected a flow for "${line}", got ${parsed.error}`);
    return parsed.flow;
  };

  it("reads a French comma decimal and a /mois cadence", () => {
    expect(draft("Netflix 13,49 /mois")).toMatchObject({
      label: "Netflix",
      amount: 13.49,
      cadence: "monthly",
      direction: "out",
      kind: "sub",
    });
  });

  it("reads a yearly cadence in either language", () => {
    expect(draft("Nom de domaine 12 /an").cadence).toBe("yearly");
    expect(draft("Domain 12 yearly").cadence).toBe("yearly");
  });

  it("treats a leading + as income", () => {
    expect(draft("Bourse +450 /mois")).toMatchObject({ direction: "in", amount: 450 });
  });

  it("treats income words as income without a sign", () => {
    expect(draft("Salaire Exemple 900 mensuel").direction).toBe("in");
  });

  it("defaults an unsigned line to an outgoing", () => {
    expect(draft("Loyer 520 /mois").direction).toBe("out");
  });

  it("lets an explicit minus override an income word", () => {
    expect(draft("Remboursement bourse -120 /mois").direction).toBe("out");
  });

  it("classifies rent as fixed and a gym as a subscription", () => {
    expect(draft("Loyer 520 /mois").kind).toBe("fixed");
    expect(draft("Salle de sport 25 /mois").kind).toBe("sub");
    expect(draft("Courses 200 /mois").kind).toBe("variable");
  });

  it("puts an unrecognised recurring outgoing in front of him as a subscription", () => {
    expect(draft("Machin bidule 8 /mois").kind).toBe("sub");
  });

  it("classifies an unrecognised one-off as variable", () => {
    expect(draft("Machin bidule 80 ponctuel").kind).toBe("variable");
  });

  it("picks up a dormant marker and strips it from the label", () => {
    const f = draft("Adobe 71,88 /an inutilisé");
    expect(f.dormant).toBe(true);
    expect(f.label).toBe("Adobe");
  });

  it("strips currency markers and separators from the label", () => {
    expect(draft("Spotify — 11,99€ / mois").label).toBe("Spotify");
    expect(draft("25 EUR Gym").label).toBe("Gym");
  });

  it("handles a thousands separator", () => {
    expect(draft("Loyer 1 250 /mois").amount).toBe(1250);
  });

  it("reports rather than drops a line it cannot read", () => {
    expect(parseFlowLine("just some words").error).toBe("no amount found");
    expect(parseFlowLine("42").error).toBe("no label found");
  });
});

describe("parseFlowList", () => {
  it("parses a pasted list and skips blanks and comments", () => {
    const parsed = parseFlowList(
      ["# rentrées", "Bourse +450 /mois", "", "# sorties", "Loyer 520 /mois", "Salle de sport 25 /mois"].join("\n")
    );
    expect(parsed).toHaveLength(3);
    expect(parsed.every((p) => p.flow)).toBe(true);
    expect(parsed.map((p) => p.flow?.label)).toEqual(["Bourse", "Loyer", "Salle de sport"]);
  });

  it("keeps unreadable lines in the result so nothing vanishes", () => {
    const parsed = parseFlowList(["Loyer 520 /mois", "no idea what this is"].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed[1].error).toBe("no amount found");
  });
});
