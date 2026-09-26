import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-extractor-state-"));
process.env.LIFEOS_DB_PATH = path.join(temporary, "test.db");
const { createDoc, getDoc, updateDoc } = await import("./server-db");
const { persistEvidence, publishAssessment, extractionItemState } = await import("./triage-evidence");
const collection = "users/local/triageQueue";
const bundle = (id: string) => ({
  schemaVersion: "1", bundleId: id, contentHash: id, extractionVersion: "fixture-v3",
  requestedUrl: "https://example.com/item", canonicalUrl: "https://example.com/item", platform: "web",
  fetchedAt: "2026-09-26T09:00:00Z", rootSourceId: "source", sources: [{ id: "source", kind: "page", url: "https://example.com/item" }], relations: [],
  segments: [{ id: "segment", sourceId: "source", kind: "speech", text: "Source evidence.", method: "fixture" }],
  coverage: [{ sourceId: "source", aspect: "speech", status: "complete" }], quality: "usable", issues: [],
});
const makeItem = () => createDoc(collection, { url: "https://example.com/item", status: "filed", note: "Keep my intent", annotations: ["personal"], savedAt: { __date: "2025-01-01" } });
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

describe("extractor publication source snapshot", () => {
  it("refuses evidence after a concurrent user decision", () => {
    const id = makeItem(); const state = extractionItemState(getDoc(collection, id)!);
    updateDoc(collection, id, { status: "discarded" });
    expect(() => persistEvidence(bundle("decision-race"), id, state)).toThrow("Source changed");
    expect(getDoc(collection, id)?.evidenceRef).toBeUndefined();
    expect(getDoc(collection, id)?.status).toBe("discarded");
  });
  it("refuses evidence after the note changes", () => {
    const id = makeItem(); const state = extractionItemState(getDoc(collection, id)!);
    updateDoc(collection, id, { note: "Different intent" });
    expect(() => persistEvidence(bundle("note-race"), id, state)).toThrow("Source changed");
  });
  it("preserves identity, date, status and annotations when evidence attaches", () => {
    const id = makeItem(); const before = getDoc(collection, id)!;
    persistEvidence(bundle("preserve"), id, extractionItemState(before));
    const after = getDoc(collection, id)!;
    for (const key of ["id", "status", "note", "annotations", "savedAt"]) expect(after[key]).toEqual(before[key]);
    expect(after.evidenceRef).toBe("preserve");
  });
  it("rejects an incomplete expected state", () => {
    const id = makeItem();
    expect(() => persistEvidence(bundle("missing-state"), id, { status: "filed" })).toThrow("every extraction state field");
  });
  it("guards assessment publication after evidence attachment", () => {
    const id = makeItem(); persistEvidence(bundle("assessment-source"), id);
    const state = extractionItemState(getDoc(collection, id)!);
    updateDoc(collection, id, { note: "Edited during annotation" });
    expect(() => publishAssessment({ assessmentId: "assessment-race", itemId: id, bundleId: "assessment-source", createdAt: "2026-09-26T09:01:00Z", model: "fixture", promptVersion: "v3", personaHash: "hash", rubricHash: "hash", inputSegmentIds: ["segment"], omittedSegmentIds: [], inputTruncated: false, proposal: { title: "Source" }, grounding: [{ segmentId: "segment", claim: "Source evidence" }] }, undefined, state)).toThrow("Source changed");
    expect(getDoc(collection, id)?.assessmentRef).toBeUndefined();
  });
});

it.skipIf(!process.env.INGESTION_REAL_FIXTURE)("accepts the actual captured source and its grounded assessment", () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.INGESTION_REAL_FIXTURE!, "utf8"));
  const assessment = JSON.parse(fs.readFileSync(process.env.INGESTION_REAL_ASSESSMENT!, "utf8"));
  const id = createDoc(collection, { url: fixture.bundle.canonicalUrl, status: "queued" });
  persistEvidence(fixture.bundle, id, extractionItemState(getDoc(collection, id)!));
  publishAssessment({ ...assessment, itemId: id }, undefined, extractionItemState(getDoc(collection, id)!));
  expect(getDoc(collection, id)?.evidenceRef).toBe(fixture.bundle.bundleId);
  expect(getDoc(collection, id)?.assessmentRef).toBe(assessment.assessmentId);
  expect(getDoc(collection, id)?.status).toBe("proposed");
});
