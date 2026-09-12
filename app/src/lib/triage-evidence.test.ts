import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-triage-evidence-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc, getDoc } = await import("./server-db");
const {
  persistEvidence,
  publishAssessment,
  TRIAGE_EVIDENCE_COLLECTION,
  TRIAGE_ASSESSMENTS_COLLECTION,
} = await import("./triage-evidence");

const TRIAGE = "users/local/triageQueue";

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    bundleId: "bundle-1",
    contentHash: "sha256:source",
    extractionVersion: "extractor-1",
    requestedUrl: "https://example.com/requested",
    canonicalUrl: "https://example.com/canonical",
    platform: "web",
    fetchedAt: "2026-09-12T10:00:00.000Z",
    rootSourceId: "source-1",
    sources: [{ id: "source-1", kind: "page", url: "https://example.com/canonical", title: "Example" }],
    relations: [],
    segments: [{ id: "segment-1", sourceId: "source-1", kind: "body", text: "A grounded sentence.", method: "html-text" }],
    coverage: [{ sourceId: "source-1", aspect: "body", status: "complete" }],
    quality: "usable",
    issues: [],
    ...overrides,
  };
}

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    assessmentId: "assessment-1",
    itemId: "item-1",
    bundleId: "bundle-1",
    createdAt: "2026-09-12T10:01:00.000Z",
    model: "test-model",
    promptVersion: "prompt-1",
    personaHash: "persona-hash",
    rubricHash: "rubric-hash",
    inputSegmentIds: ["segment-1"],
    omittedSegmentIds: [],
    inputTruncated: false,
    proposal: { summary: "Keep this reference", destination: "vault" },
    grounding: [{ segmentId: "segment-1", quote: "A grounded sentence." }],
    ...overrides,
  };
}

function item(status = "queued") {
  return createDoc(TRIAGE, {
    url: "https://example.com/canonical",
    rawUrl: "https://example.com/canonical",
    source: "other",
    savedAt: { __date: "2026-09-12T10:00:00.000Z" },
    createdAt: { __date: "2026-09-12T10:00:00.000Z" },
    status,
    proposal: { summary: "old" },
  });
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("triage evidence persistence", () => {
  it("stores before assessment and attaches a compact item summary", () => {
    const id = item();
    persistEvidence(bundle(), id);
    expect(getDoc(TRIAGE_EVIDENCE_COLLECTION, "bundle-1")).toMatchObject({ bundleId: "bundle-1" });
    expect(getDoc(TRIAGE, id)).toMatchObject({
      evidenceRef: "bundle-1",
      evidenceSummary: { sourceCount: 1, segmentCount: 1, issueCount: 0 },
    });
  });

  it("makes identical bundle retries idempotent and conflicts on changed content", () => {
    const id = item();
    expect(() => persistEvidence(bundle(), id)).not.toThrow();
    expect(() => persistEvidence(bundle(), id)).not.toThrow();
    expect(() => persistEvidence(bundle({ platform: "x" }))).toThrow(/different content/);
  });

  it("rejects dangling references and invalid coverage status", () => {
    expect(() => persistEvidence(bundle({ rootSourceId: "missing" }))).toThrow(/rootSourceId/);
    expect(() => persistEvidence(bundle({ coverage: [{ sourceId: "source-1", status: "bad" }] }))).toThrow(/status/);
  });

  it("publishes an assessment, projects it, and promotes only queued items", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-2" }), id);
    publishAssessment(assessment({ assessmentId: "assessment-2", itemId: id, bundleId: "bundle-2" }));
    expect(getDoc(TRIAGE_ASSESSMENTS_COLLECTION, "assessment-2")).toMatchObject({ itemId: id });
    expect(getDoc(TRIAGE, id)).toMatchObject({ status: "proposed", assessmentRef: "assessment-2" });
    expect((getDoc(TRIAGE, id)?.proposal as { assessment?: unknown }).assessment).toMatchObject({
      summary: "Keep this reference",
    });
  });

  it("leaves deferred and terminal decisions intact when slow work completes", () => {
    for (const status of ["deferred", "filed", "discarded", "done"]) {
      const id = item(status);
      persistEvidence(bundle({ bundleId: `bundle-${status}` }), id);
      publishAssessment(assessment({ assessmentId: `assessment-${status}`, itemId: id, bundleId: `bundle-${status}` }));
      expect(getDoc(TRIAGE, id)?.status).toBe(status);
    }
  });

  it("requires the expected prior assessment when replacing an assessment", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-prior" }), id);
    publishAssessment(assessment({ assessmentId: "assessment-prior", itemId: id, bundleId: "bundle-prior" }));
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-next", itemId: id, bundleId: "bundle-prior" }))).toThrow(/unexpected prior/);
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-next", itemId: id, bundleId: "bundle-prior" }), "assessment-prior")).not.toThrow();
  });

  it("does not store a failed assessment, leaving evidence reusable", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-reusable" }), id);
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-failed", itemId: id, bundleId: "missing-bundle" }))).toThrow(/stored evidence/);
    expect(getDoc(TRIAGE_EVIDENCE_COLLECTION, "bundle-reusable")).not.toBeNull();
  });
});
