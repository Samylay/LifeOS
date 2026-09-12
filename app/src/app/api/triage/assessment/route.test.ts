import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-assessment-route-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc, getDoc } = await import("@/lib/server-db");
const { persistEvidence, TRIAGE_ASSESSMENTS_COLLECTION } = await import("@/lib/triage-evidence");
const { POST } = await import("./route");

const TRIAGE = "users/local/triageQueue";

function bundle(id: string, segmentId: string) {
  return {
    schemaVersion: "1",
    bundleId: id,
    contentHash: `hash-${id}`,
    extractionVersion: "extractor-1",
    requestedUrl: "https://example.com/canonical",
    canonicalUrl: "https://example.com/canonical",
    platform: "web",
    fetchedAt: "2026-09-12T10:00:00.000Z",
    rootSourceId: `source-${id}`,
    sources: [{ id: `source-${id}`, kind: "page", url: "https://example.com/canonical" }],
    relations: [],
    segments: [{ id: segmentId, sourceId: `source-${id}`, kind: "body", text: `Evidence ${id}`, method: "html-text" }],
    coverage: [{ sourceId: `source-${id}`, aspect: "body", status: "complete" }],
    quality: "usable",
    issues: [],
  };
}

function assessment(itemId: string, bundleId: string, segmentId: string) {
  return {
    assessmentId: "assessment-stale-route",
    itemId,
    bundleId,
    createdAt: "2026-09-12T10:01:00.000Z",
    model: "test-model",
    promptVersion: "prompt-1",
    personaHash: "persona-hash",
    rubricHash: "rubric-hash",
    inputSegmentIds: [segmentId],
    omittedSegmentIds: [],
    inputTruncated: false,
    proposal: { summary: "stale proposal", destination: "vault" },
    grounding: [{ segmentId }],
  };
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/triage/assessment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("POST /api/triage/assessment", () => {
  it("returns 409 and leaves the newer evidence/projection untouched", async () => {
    const itemId = createDoc(TRIAGE, {
      url: "https://example.com/canonical",
      rawUrl: "https://example.com/canonical",
      source: "other",
      status: "queued",
      proposal: { summary: "original" },
    });
    persistEvidence(bundle("route-b1", "route-seg-b1"), itemId);
    persistEvidence(bundle("route-b2", "route-seg-b2"), itemId);

    const response = await POST(post({ assessment: assessment(itemId, "route-b1", "route-seg-b1") }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("current evidence") });
    expect(getDoc(TRIAGE_ASSESSMENTS_COLLECTION, "assessment-stale-route")).toBeNull();
    expect(getDoc(TRIAGE, itemId)).toMatchObject({ evidenceRef: "route-b2", status: "queued", proposal: { summary: "original" } });
  });
});
