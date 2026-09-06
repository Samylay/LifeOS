import { describe, it, expect } from "vitest";
import { buildCopyContext } from "./copy-context";

describe("buildCopyContext", () => {
  it("lays out every delivered field as Label: value, nothing more", () => {
    const text = buildCopyContext(
      {
        counterparty: "Acme Corp",
        requirement: "a Next.js dashboard",
        deadline: new Date("2026-09-20T00:00:00.000Z"),
        budget: "2000-5000 EUR",
        url: "https://codeur.com/x",
      },
      [],
    );
    expect(text).toBe(
      [
        "Counterparty: Acme Corp",
        "Needs: a Next.js dashboard",
        "Deadline: 2026-09-20",
        "Budget: 2000-5000 EUR",
        "Source: https://codeur.com/x",
      ].join("\n"),
    );
  });

  it("omits a field the lead never delivered — no blank line, no placeholder", () => {
    const text = buildCopyContext(
      { counterparty: "Acme Corp", requirement: "", deadline: null, budget: "", url: "" },
      [],
    );
    expect(text).toBe("Counterparty: Acme Corp");
    expect(text).not.toMatch(/N\/A|undefined|null/i);
  });

  it("produces nothing but an empty string when the lead delivered nothing at all", () => {
    const text = buildCopyContext({ counterparty: "", requirement: "", deadline: null, budget: "", url: "" }, []);
    expect(text).toBe("");
  });

  it("appends related work only when there is some", () => {
    const withNone = buildCopyContext(
      { counterparty: "Acme", requirement: "", deadline: null, budget: "", url: "" },
      [],
    );
    expect(withNone).not.toContain("Related work");

    const withSome = buildCopyContext(
      { counterparty: "Acme", requirement: "", deadline: null, budget: "", url: "" },
      [{ title: "Acme rebuild", path: "clients/acme.md" }],
    );
    expect(withSome).toBe(["Counterparty: Acme", "", "Related work:", "- Acme rebuild (clients/acme.md)"].join("\n"));
  });

  it("never contains anything but label:value lines and a bullet list — no outreach-shaped prose", () => {
    const text = buildCopyContext(
      { counterparty: "Acme", requirement: "a rebuild", deadline: null, budget: "", url: "" },
      [{ title: "Prior", path: "p.md" }],
    );
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      const isLabelled = /^(Counterparty|Needs|Deadline|Budget|Source): /.test(line);
      const isRelatedHeader = line === "Related work:";
      const isBullet = line.startsWith("- ");
      expect(isLabelled || isRelatedHeader || isBullet).toBe(true);
    }
  });
});
