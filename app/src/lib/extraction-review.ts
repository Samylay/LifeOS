export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sourceClaims(bundle: Record<string, unknown>, assessment: Record<string, unknown>) {
  if (assessment.bundleId !== bundle.bundleId) return [];
  const segments = Array.isArray(bundle.segments) ? bundle.segments.map(record) : [];
  const sources = Array.isArray(bundle.sources) ? bundle.sources.map(record) : [];
  const claims = Array.isArray(assessment.grounding) ? assessment.grounding.map(record) : [];
  return claims.flatMap((claim) => {
    const ids = Array.isArray(claim.segmentIds) ? claim.segmentIds : [claim.segmentId];
    if (typeof claim.claim !== "string" || !ids.length || ids.some((id) => !segments.some((segment) => segment.id === id))) return [];
    const evidence = segments.filter((segment) => ids.includes(segment.id));
    const first = evidence.find((segment) => typeof segment.startMs === "number") ?? evidence[0];
    const source = sources.find((source) => source.id === first.sourceId);
    const startMs = typeof first.startMs === "number" && Number.isFinite(first.startMs) && first.startMs >= 0 ? first.startMs : null;
    let url: string | null = null;
    try {
      const target = new URL(String(source?.url));
      if (["https:", "http:"].includes(target.protocol)) {
        if (startMs !== null && ["video", "audio"].includes(String(source?.kind))) target.hash = `t=${startMs / 1000}`;
        url = target.href;
      }
    } catch { /* Missing source links remain plain text. */ }
    return [{ text: claim.claim, startMs, url, evidenceCount: evidence.length }];
  });
}
