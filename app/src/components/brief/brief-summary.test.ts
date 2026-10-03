import { describe, it, expect } from "vitest";
import type { BriefCard } from "@/lib/brief-types";
import { mergeTriage, oneLiner, plainText } from "./brief-cards";

const card = (over: Partial<BriefCard>): BriefCard => ({ id: "c", type: "work", priority: "action", status: "neutral", title: "T", body: {}, link: null, error: null, ...over });
const triage = (source: string, keep: number, drop: number) =>
  card({ id: `triage-${source}`, type: "triage", title: `Triage · ${source}`, body: { source, keep: Array(keep).fill({}), drop: Array(drop).fill({}), total: keep + drop, shown: keep + drop, hint: "" } });

describe("brief card summaries", () => {
  it("strips links so titles read as words", () => {
    expect(plainText("Review 3 LifeOS interpretations (2 minutes): https://homelab.example.net/decide/calibrate")).toBe("Review 3 LifeOS interpretations (2 minutes)");
    expect(plainText("Write a post")).toBe("Write a post");
  });

  it("summarises work as a count plus the first item", () => {
    const body = { tasks: [{ content: "SWE-learning plan" }, { content: "Polymath plan" }], events: [{ title: "Gym", start: "x" }] };
    expect(oneLiner(card({ type: "work", body }))).toBe("2 due · 1 event · SWE-learning plan");
    expect(oneLiner(card({ type: "work", body: { tasks: [], events: [] } }))).toBe("nothing due");
  });

  it("summarises planning, and a failed source says unavailable", () => {
    expect(oneLiner(card({ type: "planning", body: { blocks: [{}, {}, {}] } }))).toBe("3 blocks");
    expect(oneLiner(card({ type: "planning", body: { blocks: [] } }))).toBe("no blocks yet");
    expect(oneLiner(card({ type: "planning", error: "failed to read calendar" }))).toBe("unavailable");
  });
});

describe("merging triage cards", () => {
  it("replaces three per-source cards with one Inbox card and keeps order", () => {
    const cards = [card({ id: "a", type: "work" }), triage("x", 3, 2), triage("instagram", 0, 4), triage("other", 1, 0), card({ id: "z", type: "fuite" })];
    const merged = mergeTriage(cards);
    expect(merged.map((c) => c.id)).toEqual(["a", "triage-merged", "z"]);
    expect(oneLiner(merged[1])).toBe("10 saved items waiting");
    expect(merged[1].link).toBe("/decide");
  });

  it("leaves a single triage card alone", () => {
    expect(mergeTriage([triage("x", 1, 1)])).toHaveLength(1);
    expect(mergeTriage([triage("x", 1, 1)])[0].id).toBe("triage-x");
  });
});
