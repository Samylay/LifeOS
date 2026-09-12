import { describe, expect, it } from "vitest";
import {
  coverageView,
  formatTimestamp,
  parseEvidenceBundle,
  segmentLabel,
  sourceIdHint,
  sourceLabel,
  type EvidenceBundleView,
} from "./evidence-details";

function bundle(overrides: Partial<EvidenceBundleView> = {}): EvidenceBundleView {
  return {
    schemaVersion: "1",
    bundleId: "bundle-1",
    contentHash: "hash",
    extractionVersion: "x-1",
    requestedUrl: "https://x.example/post/1",
    canonicalUrl: "https://x.example/post/1",
    platform: "x",
    fetchedAt: "2026-09-12T10:00:00.000Z",
    rootSourceId: "post-1",
    sources: [
      { id: "post-1", kind: "post", url: "https://x.example/post/1", author: "Samy" },
      { id: "post-2", kind: "post", url: "https://x.example/post/2", author: "Author" },
      { id: "child-1", kind: "page", url: "https://example.com/guide", title: "Linked guide" },
      { id: "image-1", kind: "image", url: "https://cdn.example/image.jpg", order: 2 },
    ],
    relations: [
      { fromSourceId: "post-1", toSourceId: "post-2", kind: "reply" },
      { fromSourceId: "post-1", toSourceId: "child-1", kind: "links_to" },
      { fromSourceId: "post-1", toSourceId: "image-1", kind: "contains" },
    ],
    segments: [
      { id: "caption-1", sourceId: "post-1", kind: "caption", method: "x-caption", text: "The author claim." },
      { id: "ocr-1", sourceId: "image-1", kind: "ocr", method: "vision-ocr", text: "Linked visual fact." },
    ],
    coverage: [{ sourceId: "post-1", aspect: "post", status: "complete" }],
    quality: "usable",
    issues: [],
    ...overrides,
  };
}

describe("Decide evidence presentation", () => {
  it("keeps X author, thread, linked-site, and slide provenance distinct", () => {
    const value = bundle();
    expect(sourceLabel(value, value.sources[0])).toBe("X post · Samy");
    expect(sourceLabel(value, value.sources[1])).toBe("Thread post · Author");
    expect(sourceLabel(value, value.sources[2])).toBe("Linked site");
    expect(sourceLabel(value, value.sources[3])).toBe("Slide 2");
  });

  it("shows Instagram transcript timing and per-slide OCR labels", () => {
    const transcript = { id: "transcript", sourceId: "reel", kind: "transcript", method: "whisper", text: "spoken", startMs: 61_000, endMs: 64_500 };
    const ocr = { id: "slide-ocr", sourceId: "slide-2", kind: "ocr", method: "instagram-alt-ocr", text: "on screen", slideIndex: 2 };
    expect(segmentLabel(transcript)).toBe("Transcript");
    expect(segmentLabel(ocr)).toBe("Alt text OCR");
    expect(formatTimestamp(transcript.startMs)).toBe("1:01");
    expect(formatTimestamp(transcript.endMs)).toBe("1:04");
  });

  it("states partial cover-only extraction and its reason", () => {
    const result = coverageView(bundle({
      sources: [bundle().sources[0]],
      segments: [],
      coverage: [{ sourceId: "post-1", aspect: "reel media", status: "partial", reasonCode: "cover_only", detail: "video could not be fetched" }],
      quality: "limited",
    }));
    expect(result.status).toBe("partial");
    expect(result.line).toContain("Extraction partial");
    expect(result.line).toContain("video could not be fetched");
    expect(result.reasons).toEqual(["Reel Media: video could not be fetched"]);
  });

  it("states unavailable coverage explicitly", () => {
    const result = coverageView(bundle({
      coverage: [{ sourceId: "post-1", aspect: "caption", status: "unavailable", reasonCode: "login_required" }],
      quality: "unavailable",
    }));
    expect(result.status).toBe("unavailable");
    expect(result.line).toContain("Extraction unavailable");
    expect(result.reasons[0]).toContain("Login Required");
  });

  it("accepts the generic document shape but rejects broken references", () => {
    expect(parseEvidenceBundle(bundle())).not.toBeNull();
    expect(parseEvidenceBundle({ ...bundle(), rootSourceId: "missing" })).toBeNull();
    expect(parseEvidenceBundle({ ...bundle(), requestedUrl: "javascript:alert(1)" })).toBeNull();
  });

  it("keeps source identifiers compact without losing their title", () => {
    expect(sourceIdHint("source-with-a-stable-long-identifier")).toBe("source-w…tifier");
    expect(sourceIdHint("short-id")).toBe("short-id");
  });
});
