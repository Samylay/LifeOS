import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TriageQueueItem } from "@/components/decide/triage-card";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-triage-evidence-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc, getDoc } = await import("./server-db");
const {
  persistEvidence,
  publishAssessment,
  validateEvidenceBundle,
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

  it("rejects empty segments and accepts the Instagram contract shape", () => {
    expect(() => validateEvidenceBundle(bundle({ segments: [{ id: "frame-1", sourceId: "source-1", kind: "frame", text: "", method: "cover" }] }))).toThrow(/non-empty string/);
    const instagram = {
      ...bundle({
        bundleId: "instagram-bundle",
        requestedUrl: "https://instagram.com/reel/abc123",
        canonicalUrl: "https://instagram.com/reel/abc123",
        platform: "instagram",
        rootSourceId: "ig-post",
        sources: [
          { id: "ig-post", kind: "post", url: "https://instagram.com/reel/abc123", order: 0 },
          { id: "ig-slide-1", kind: "image", url: "https://cdn.example/slide-1.jpg", order: 1, mediaMetadata: { altTextProvenance: "instagram-accessibility" } },
          { id: "ig-slide-2", kind: "video", url: "https://cdn.example/slide-2.mp4", order: 2 },
        ],
        relations: [
          { fromSourceId: "ig-post", toSourceId: "ig-slide-1", kind: "contains" },
          { fromSourceId: "ig-post", toSourceId: "ig-slide-2", kind: "contains" },
        ],
        segments: [
          { id: "ig-caption", sourceId: "ig-post", kind: "caption", text: "A reel caption.", method: "instagram-caption" },
          { id: "ig-alt", sourceId: "ig-slide-1", kind: "alt-text", text: "Text that says: hello", method: "instagram-alt-ocr", slideIndex: 1 },
          { id: "ig-transcript", sourceId: "ig-slide-2", kind: "transcript", text: "Spoken words.", method: "whisper", startMs: 1200, endMs: 2400 },
          { id: "ig-ocr", sourceId: "ig-slide-2", kind: "ocr", text: "On-screen words.", method: "vision-ocr", frameId: "frame-1", startMs: 5000, endMs: 5500 },
        ],
        coverage: [
          { sourceId: "ig-post", aspect: "caption", status: "complete" },
          { sourceId: "ig-slide-1", aspect: "alt-text", status: "complete" },
          { sourceId: "ig-slide-2", aspect: "transcript", status: "complete" },
          { sourceId: "ig-slide-2", aspect: "frames", status: "partial", reasonCode: "sampled" },
        ],
      }),
    };
    expect(validateEvidenceBundle(instagram)).toMatchObject({ platform: "instagram", rootSourceId: "ig-post" });
  });

  it("publishes an assessment, projects it, and promotes only queued items", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-2" }), id);
    const cardAssessment = { verdict: "adopt", detail: "Works", effort: "small", payoff: "useful", apply: "Try it" };
    publishAssessment(assessment({
      assessmentId: "assessment-2",
      itemId: id,
      bundleId: "bundle-2",
      proposal: {
        summary: "Keep this reference",
        destination: "vault",
        assessment: cardAssessment,
        topicTags: ["systems"],
        vaultTags: ["reference"],
        arbitraryModelField: { mustNotReachQueue: true },
      },
    }));
    expect(getDoc(TRIAGE_ASSESSMENTS_COLLECTION, "assessment-2")).toMatchObject({ itemId: id });
    const card = getDoc(TRIAGE, id) as unknown as TriageQueueItem;
    expect(card).toMatchObject({ status: "proposed", assessmentRef: "assessment-2", topicTags: ["systems"], vaultTags: ["reference"] });
    expect(card.proposal?.assessment).toEqual(cardAssessment);
    expect(card.proposal).not.toHaveProperty("arbitraryModelField");
  });

  it("keeps existing learning attachment fields when an assessment omits tags", () => {
    const id = createDoc(TRIAGE, {
      url: "https://example.com/canonical",
      rawUrl: "https://example.com/canonical",
      source: "other",
      savedAt: { __date: "2026-09-12T10:00:00.000Z" },
      createdAt: { __date: "2026-09-12T10:00:00.000Z" },
      status: "queued",
      topicTags: ["existing-topic"],
      vaultTags: ["existing-vault"],
      proposal: { summary: "old" },
    });
    persistEvidence(bundle({ bundleId: "bundle-tags-preserved" }), id);
    publishAssessment(assessment({ assessmentId: "assessment-tags-preserved", itemId: id, bundleId: "bundle-tags-preserved" }));
    expect(getDoc(TRIAGE, id)).toMatchObject({ topicTags: ["existing-topic"], vaultTags: ["existing-vault"] });
  });

  it("removes an old assessment projection when a new extraction is attached", () => {
    const id = createDoc(TRIAGE, {
      url: "https://example.com/canonical",
      rawUrl: "https://example.com/canonical",
      source: "other",
      savedAt: { __date: "2026-09-12T10:00:00.000Z" },
      createdAt: { __date: "2026-09-12T10:00:00.000Z" },
      status: "filed",
      assessmentRef: "old-assessment",
      proposal: { summary: "keep decision", assessment: { verdict: "adopt" } },
    });
    persistEvidence(bundle({ bundleId: "new-bundle" }), id);
    expect(getDoc(TRIAGE, id)).toMatchObject({ status: "filed", evidenceRef: "new-bundle", assessmentRef: "old-assessment", proposal: { summary: "keep decision" } });
    expect(getDoc(TRIAGE, id)?.proposal).not.toHaveProperty("assessment");
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
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-prior", itemId: id, bundleId: "bundle-prior", proposal: { summary: "changed" } }))).toThrow(/different content/);
  });

  it("rejects a stale assessment after a newer bundle becomes current", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-old" }), id);
    persistEvidence(bundle({ bundleId: "bundle-new" }), id);
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-stale", itemId: id, bundleId: "bundle-old" }))).toThrow(/current evidence/);
    expect(getDoc(TRIAGE_ASSESSMENTS_COLLECTION, "assessment-stale")).toBeNull();
    expect(getDoc(TRIAGE, id)).toMatchObject({ evidenceRef: "bundle-new", status: "queued", proposal: { summary: "old" } });
  });

  it("rejects malformed tag promotion without storing the assessment", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-bad-tags" }), id);
    expect(() => publishAssessment(assessment({
      assessmentId: "assessment-bad-tags",
      itemId: id,
      bundleId: "bundle-bad-tags",
      proposal: { summary: "bad", topicTags: "systems" },
    }))).toThrow(/proposal\.topicTags/);
    expect(getDoc(TRIAGE_ASSESSMENTS_COLLECTION, "assessment-bad-tags")).toBeNull();
  });

  it("does not store a failed assessment, leaving evidence reusable", () => {
    const id = item();
    persistEvidence(bundle({ bundleId: "bundle-reusable" }), id);
    expect(() => publishAssessment(assessment({ assessmentId: "assessment-failed", itemId: id, bundleId: "missing-bundle" }))).toThrow(/stored evidence/);
    expect(getDoc(TRIAGE_EVIDENCE_COLLECTION, "bundle-reusable")).not.toBeNull();
  });
});
