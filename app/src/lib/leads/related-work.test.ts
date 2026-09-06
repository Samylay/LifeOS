import { describe, it, expect } from "vitest";
import { relatedWorkQuery, selectRelatedWork, RELATED_WORK_LIMIT, type NoteSearcher, type RelatedWorkNote } from "./related-work";

function fakeSearch(notes: RelatedWorkNote[]): NoteSearcher {
  return () => ({ notes });
}

describe("relatedWorkQuery", () => {
  it("joins counterparty and requirement", () => {
    expect(relatedWorkQuery({ counterparty: "Acme", requirement: "a dashboard" })).toBe("Acme a dashboard");
  });

  it("is empty when both fields are blank", () => {
    expect(relatedWorkQuery({ counterparty: "", requirement: "  " })).toBe("");
  });

  it("uses whichever field is present when the other is blank", () => {
    expect(relatedWorkQuery({ counterparty: "Acme", requirement: "" })).toBe("Acme");
    expect(relatedWorkQuery({ counterparty: "", requirement: "a dashboard" })).toBe("a dashboard");
  });
});

describe("selectRelatedWork", () => {
  it("returns nothing when there is no query to search with — never calls the searcher on empty input", () => {
    let called = false;
    const search: NoteSearcher = () => {
      called = true;
      return { notes: [{ path: "x.md", title: "X" }] };
    };
    expect(selectRelatedWork({ counterparty: "", requirement: "" }, search)).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns matched notes mapped to the card shape, summary included", () => {
    const search = fakeSearch([{ path: "clients/acme.md", title: "Acme rebuild", summary: "shipped 2025" }]);
    const result = selectRelatedWork({ counterparty: "Acme", requirement: "dashboard" }, search);
    expect(result).toEqual([{ path: "clients/acme.md", title: "Acme rebuild", summary: "shipped 2025" }]);
  });

  it("stays quiet — an empty match list stays empty, never padded with something else", () => {
    const search = fakeSearch([]);
    expect(selectRelatedWork({ counterparty: "Acme", requirement: "dashboard" }, search)).toEqual([]);
  });

  it("caps at the limit even if the searcher returns more", () => {
    const many = Array.from({ length: RELATED_WORK_LIMIT + 5 }, (_, i) => ({ path: `n${i}.md`, title: `N${i}` }));
    const search = fakeSearch(many);
    expect(selectRelatedWork({ counterparty: "Acme", requirement: "dashboard" }, search)).toHaveLength(RELATED_WORK_LIMIT);
  });

  it("respects a custom, smaller limit", () => {
    const many = [
      { path: "a.md", title: "A" },
      { path: "b.md", title: "B" },
      { path: "c.md", title: "C" },
    ];
    const search = fakeSearch(many);
    expect(selectRelatedWork({ counterparty: "Acme", requirement: "x" }, search, 1)).toHaveLength(1);
  });
});
