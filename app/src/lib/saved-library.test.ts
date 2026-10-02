import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saved-library-"));
process.env.LIFEOS_DB_PATH = path.join(tmp, "test.db");
const { setDoc, getDoc } = await import("./server-db");
const { savedLibrary, publishSavedClassification, SAVED_CLASSIFICATIONS, capturedSourcePreview } = await import("./saved-library");
const { extractionItemState } = await import("./triage-evidence");
function setup(id: string, status = "proposed") {
  setDoc("users/local/triageQueue", id, { url: "https://example.org/" + id, status, note: "Keep my note", evidenceRef: "e-" + id, savedAt: "2026-10-02", proposal: { title: "Reference " + id } });
  setDoc("users/local/triageEvidence", "e-" + id, { itemId: id, canonicalUrl: "https://example.org/" + id, quality: "limited", segments: [{ id: "s1", text: "Polyphonic counterpoint in a fugue" }] });
  return extractionItemState(getDoc("users/local/triageQueue", id)!);
}
function record(id: string) { return { itemId: id, bundleId: "e-" + id, model: "test", classifierVersion: "v1", taxonomyHash: "hash", classification: { fields: [{ id: "music", reason: "Music composition", segmentIds: ["s1"] }], areas: [], abstain: false, limitations: ["Partial source"] } }; }
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
describe("saved library", () => {
  it("omits repeated titles and unrelated replies from the content preview", () => {
    const preview = capturedSourcePreview({ segments: [{ role: "title", text: "Chair" }, { role: "document-body", text: "Chair" }, { role: "reply_other", text: "Other opinion" }, { role: "document-body", text: "The seat recalls a leaf." }] });
    expect(preview).toEqual({ title: "Chair", preview: "The seat recalls a leaf." });
    expect(capturedSourcePreview({ segments: [{ role: "access-notice", text: "Log in" }] })).toEqual({ title: undefined, preview: undefined });
  });
  it("searches captured content and keeps discarded saves accessible", () => {
    setup("discarded", "discarded");
    expect(savedLibrary({ q: "counterpoint" }).items.some(v => v.id === "discarded")).toBe(true);
  });
  it("shows captured titles and source text before a search is entered", () => {
    setDoc("users/local/triageQueue", "content-preview", { url: "https://example.org/content-preview", status: "filed", evidenceRef: "content-preview", savedAt: "2026-10-02" });
    setDoc("users/local/triageEvidence", "content-preview", { quality: "limited", segments: [
      { role: "access-notice", text: "Sign in" }, { role: "user-context", text: "My private intent" },
      { role: "title", text: "Composition reference" }, { role: "document-body", text: "A fugue develops a subject through several voices." },
    ] });
    const row = savedLibrary().items.find(v => v.id === "content-preview")!;
    expect(row.title).toBe("Composition reference");
    expect(row.snippet).toBe("A fugue develops a subject through several voices.");
    expect(savedLibrary({ q: "Sign in" }).items.some(v => v.id === "content-preview")).toBe(false);
  });
  it("uses an actual caption when no title or proposal is available", () => {
    setDoc("users/local/triageQueue", "caption-preview", { url: "https://example.org/caption-preview", evidenceRef: "caption-preview" });
    setDoc("users/local/triageEvidence", "caption-preview", { quality: "limited", segments: [{ role: "author-caption", text: "A composition technique\nSecond line" }] });
    const row = savedLibrary().items.find(v => v.id === "caption-preview")!;
    expect(row.title).toBe("A composition technique");
    expect(row.snippet).toBe("A composition technique\nSecond line");
  });
  it("accepts a reference without human calibration or executable work", () => {
    const state = setup("accepted");
    publishSavedClassification(record("accepted"), state, true);
    const item = getDoc("users/local/triageQueue", "accepted")!;
    expect(item.status).toBe("filed");
    expect(item.filedAs).toBe("saved-reference");
    expect(item.note).toBe("Keep my note");
    expect(item.calibration).toBeUndefined();
    expect(savedLibrary({ field: "music" }).items.some(v => v.id === "accepted")).toBe(true);
  });
  it("preserves an earlier explicit decision", () => {
    const state = setup("kept", "discarded");
    publishSavedClassification(record("kept"), state, true);
    expect(getDoc("users/local/triageQueue", "kept")?.status).toBe("discarded");
  });
  it("rejects a concurrent user edit", () => {
    const state = setup("edited");
    setDoc("users/local/triageQueue", "edited", { ...getDoc("users/local/triageQueue", "edited"), note: "Changed" });
    expect(() => publishSavedClassification(record("edited"), state, true)).toThrow("changed");
  });
  it("rejects fabricated evidence and unknown labels", () => {
    const state = setup("invalid");
    const r = record("invalid");
    r.classification.fields[0].segmentIds = ["invented"];
    expect(() => publishSavedClassification(r, state)).toThrow("cite");
    r.classification.fields[0].segmentIds = ["s1"];
    r.classification.fields[0].id = "fake";
    expect(() => publishSavedClassification(r, state)).toThrow("Unknown");
  });
  it("stops showing labels after a note correction", () => {
    const state = setup("note-correction");
    publishSavedClassification(record("note-correction"), state);
    setDoc("users/local/triageQueue", "note-correction", { ...getDoc("users/local/triageQueue", "note-correction"), note: "New intent" });
    expect(savedLibrary({ field: "music" }).items.some(v => v.id === "note-correction")).toBe(false);
  });
  it("stops showing old taxonomy when evidence changes", () => {
    const state = setup("stale");
    const result = publishSavedClassification(record("stale"), state);
    expect(getDoc(SAVED_CLASSIFICATIONS, result.id)).not.toBeNull();
    setDoc("users/local/triageQueue", "stale", { ...getDoc("users/local/triageQueue", "stale"), evidenceRef: "new-evidence" });
    expect(savedLibrary({ field: "music" }).items.some(v => v.id === "stale")).toBe(false);
  });
});
