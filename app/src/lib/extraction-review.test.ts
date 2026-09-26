import { describe, expect, it } from "vitest";
import { sourceClaims } from "./extraction-review";
const bundle = { bundleId: "b", sources: [{ id: "v", kind: "video", url: "https://example.com/video.mp4" }], segments: [{ id: "s", sourceId: "v", startMs: 12300 }] };
const assessment = { bundleId: "b", grounding: [{ claim: "The speaker suggests a small first step.", segmentIds: ["s"] }] };
describe("extraction source review", () => {
  it("links a claim to the observed media timestamp", () => {
    expect(sourceClaims(bundle, assessment)[0].url).toBe("https://example.com/video.mp4#t=12.3");
  });
  it("hides stale assessments", () => { expect(sourceClaims(bundle, { ...assessment, bundleId: "old" })).toEqual([]); });
  it("rejects missing citations", () => { expect(sourceClaims(bundle, { ...assessment, grounding: [{ claim: "Made up", segmentIds: ["absent"] }] })).toEqual([]); });
  it("does not expose unsafe source URLs", () => {
    expect(sourceClaims({ ...bundle, sources: [{ id: "v", url: "javascript:alert(1)" }] }, assessment)[0].url).toBeNull();
  });
});
