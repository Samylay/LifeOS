import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { DEFAULTS, emptyRound, profile, recommend, validateReview, type Session, type Round } from "./model";
import { MATERIALS } from "./materials";

const generated = vi.hoisted(() => vi.fn());
vi.mock("../claude-cli", () => ({ generateReviewJson: generated }));
const transcribe = vi.hoisted(() => vi.fn());
vi.mock("../voice-transcribe", () => ({ transcribeAudio: transcribe }));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-fluency-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmp, "test.db");
const store = await import("./store");
const { POST } = await import("../../app/api/fluency/route");
const audio = await import("../../app/api/fluency/[id]/audio/route");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { generated.mockReset(); transcribe.mockReset(); });
const post = async (body: unknown) => { const r = await POST(new NextRequest("http://localhost/api/fluency", { method: "POST", body: JSON.stringify(body) })); return { status: r.status, ...await r.json() }; };
const spoken = (id: string, day: string, kind: "strength" | "difficulty" = "difficulty"): Session => {
  const round: Round = { ...emptyRound("Explain it"), revision: 1, turns: [{ id: "t", role: "user", original: "The tool helps us share work.", text: "The tool helps us share work.", version: 1, source: "recorded", disputed: false }] };
  round.review = { revision: 1, feedback: "Feedback", cue: "Cue", observations: [{ skill: "point", kind, turnId: "t", quote: "The tool helps", note: "Example observation" }] };
  return { id, createdAt: day, material: MATERIALS.find(m => m.id === "tool")!, preferences: DEFAULTS, rounds: [round], phase: 0, status: "active" };
};
describe("evidence-based profile", () => {
  it("requires separate sessions, not repeated excerpts or retries", () => {
    const a = spoken("a", "2026-01-01");
    a.rounds[0].review!.observations.push(a.rounds[0].review!.observations[0]);
    a.rounds.push(a.rounds[0]);
    expect(profile([a], "en")[0].state).toBe("tentative");
    expect(profile([a, spoken("b", "2026-01-02")], "en")[0].state).toBe("recurring");
  });
  it.each(["typed", "disputed", "hint", "passage", "stale"])("does not promote %s evidence", type => {
    const a = spoken("a", "2026-01-01");
    if (type === "typed") a.rounds[0].turns[0].source = "typed";
    if (type === "disputed") a.rounds[0].turns[0].disputed = true;
    if (type === "hint") a.rounds[0].hints = 1;
    if (type === "passage") a.material = { ...a.material, passage: "Read this" };
    if (type === "stale") a.rounds[0].revision++;
    expect(profile([a], "en")).toEqual([]);
  });
  it("keeps languages and practice blocks separate", () => {
    const a = spoken("a", "2026-01-01"), b = spoken("b", "2026-01-02");
    b.material = { ...b.material, language: "fr" };
    expect(profile([a, b], "en")[0].state).toBe("tentative");
    b.material = { ...b.material, language: "en", block: "presentation" };
    expect(profile([a, b], "en").map(p => p.state)).toEqual(["tentative", "tentative"]);
  });
  it("records counterexamples and updates the focus without time-based decay", () => {
    const attempts = [spoken("a", "2026-01-01"), spoken("b", "2026-01-02"), spoken("c", "2026-01-03", "strength"), spoken("d", "2026-01-04", "strength")];
    const p = profile(attempts, "en")[0];
    expect(p.state).toBe("improving"); expect(p.evidence).toHaveLength(2); expect(p.strengths).toHaveLength(2);
  });
  it("respects explicit and dismissed priorities and material language", () => {
    const attempts = [spoken("a", "1"), spoken("b", "2")];
    expect(recommend(MATERIALS, attempts, DEFAULTS, "explanation")?.material.skill).toBe("point");
    expect(recommend(MATERIALS, attempts, { ...DEFAULTS, focus: "support" }, "explanation")?.material.skill).toBe("support");
    expect(recommend(MATERIALS, attempts, { ...DEFAULTS, dismissed: ["en:point"] }, "explanation")?.reason).toContain("new speaking rep");
    expect(recommend(MATERIALS, attempts, { ...DEFAULTS, language: "fr" }, "explanation")).toBeNull();
  });
  it("rejects fabricated evidence, agent words, and unknown skill labels", () => {
    const r = spoken("a", "1").rounds[0], value = r.review!;
    expect(validateReview(value, r).observations).toHaveLength(1);
    expect(() => validateReview({ ...value, observations: [{ ...value.observations[0], quote: "invented quote" }] }, r)).toThrow();
    expect(() => validateReview({ ...value, observations: [{ ...value.observations[0], skill: "anxiety" }] }, r)).toThrow();
    r.turns[0].role = "agent"; expect(() => validateReview(value, r)).toThrow();
  });
});
describe("saved practice behavior", () => {
  it("runs attempt, review, retry, transfer and completion without duplicating turns", async () => {
    const created = await post({ action: "create", materialId: "tool" });
    const id = created.session.id;
    for (let phase = 0; phase < 3; phase++) {
      const body = { action: "turn", id, phase, turnId: `t${phase}`, text: "The tool helps us share work.", source: "live" };
      await post(body); await post(body);
      expect(store.session(id).rounds[phase].turns).toHaveLength(1);
      generated.mockResolvedValue({ feedback: "Start with its benefit.", cue: "State what it does first.", observations: [{ skill: "point", kind: "difficulty", turnId: `t${phase}`, quote: "The tool helps", note: "Example" }] });
      expect((await post({ action: "review", id })).status).toBe(200);
      await post({ action: "review", id });
      expect(generated).toHaveBeenCalledTimes(phase + 1);
      expect((await post({ action: "advance", id })).status).toBe(200);
    }
    const s = store.session(id);
    expect(s.status).toBe("complete"); expect(s.rounds[1].prompt).toBe(s.material.prompt); expect(s.rounds[2].prompt).toBe(s.material.variation);
  });
  it("correction invalidates review while preserving raw text and prevents stale writes", async () => {
    const s = spoken("correction", "2026-01-01"); store.saveSession(s);
    const result = await post({ action: "correct", id: s.id, phase: 0, turnId: "t", version: 1, text: "The tool helps a team.", disputed: false });
    expect(result.session.rounds[0].review).toBeNull();
    expect(result.session.rounds[0].turns[0].original).toBe("The tool helps us share work.");
    expect(profile([result.session], "en")).toEqual([]);
    expect((await post({ action: "correct", id: s.id, phase: 0, turnId: "t", version: 1, text: "old edit" })).status).toBe(400);
  });
  it("cannot advance an unreviewed round or review empty speech", async () => {
    const s = store.createSession(MATERIALS[0]);
    expect((await post({ action: "advance", id: s.id })).status).toBe(400);
    expect((await post({ action: "review", id: s.id })).status).toBe(400);
    expect(generated).not.toHaveBeenCalled();
  });
  it("failed review keeps the attempt recoverable", async () => {
    const s = spoken("failed-review", "2026-01-01"); s.rounds[0].review = null; store.saveSession(s);
    generated.mockRejectedValue(new Error("Model unavailable"));
    expect((await post({ action: "review", id: s.id })).status).toBe(400);
    expect(store.session(s.id).rounds[0].turns).toHaveLength(1);
    expect(store.session(s.id).rounds[0].review).toBeNull();
  });
  it("rejects a review if evidence changes while generation is in flight", async () => {
    const s = spoken("concurrent", "2026-01-01"), review = s.rounds[0].review; s.rounds[0].review = null; store.saveSession(s);
    generated.mockImplementation(async () => { const current = store.session(s.id); store.changeTurn(current, 0, { ...current.rounds[0].turns[0], text: "Corrected text", version: 2 }); return review; });
    expect((await post({ action: "review", id: s.id })).status).toBe(400);
    expect(store.session(s.id).rounds[0].review).toBeNull();
  });
  it("material edits do not rewrite historical exercises", async () => {
    const s = store.createSession(MATERIALS[0]);
    const result = await post({ action: "material", ...MATERIALS[0], prompt: "A changed prompt" });
    expect(result.status).toBe(200); expect(store.session(s.id).material.prompt).toBe(MATERIALS[0].prompt);
  });
  it("blocks cross-origin mutations", async () => {
    const r = await POST(new NextRequest("http://localhost/api/fluency", { method: "POST", headers: { origin: "https://attacker.test", host: "localhost" }, body: JSON.stringify({ action: "create", materialId: "tool" }) }));
    expect(r.status).toBe(400);
  });
  it("keeps failed audio recoverable and retries without duplicating attempts", async () => {
    const s = store.createSession(MATERIALS[1]);
    transcribe.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, transcript: "I recommend a walk." });
    const form = new FormData(); form.set("audio", new Blob(["fixture"], { type: "audio/webm" }));
    const response = await audio.POST(new NextRequest(`http://localhost/api/fluency/${s.id}/audio`, { method: "POST", body: form }), { params: Promise.resolve({ id: s.id }) });
    const result = await response.json(), turn = result.session.rounds[0].turns[0];
    expect(turn.error).toContain("recording is saved");
    const playback = await audio.GET(new NextRequest(`http://localhost/api/fluency/${s.id}/audio?turn=${turn.id}`), { params: Promise.resolve({ id: s.id }) });
    expect(await playback.text()).toBe("fixture");
    const retry = new FormData(); retry.set("retry", turn.id);
    await audio.POST(new NextRequest(`http://localhost/api/fluency/${s.id}/audio`, { method: "POST", body: retry }), { params: Promise.resolve({ id: s.id }) });
    expect(store.session(s.id).rounds[0].turns).toHaveLength(1);
    expect(store.session(s.id).rounds[0].turns[0].text).toBe("I recommend a walk.");
  });
});
