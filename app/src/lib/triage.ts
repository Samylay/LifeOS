// T33 — bookmark-triage shared logic. Pure functions (no I/O) so the
// canonicalization + source inference are unit-testable; the ingest route
// (api/triage/ingest) and the nightly study step both build on these.

export type TriageSource = "x" | "instagram" | "other";
export type TriageStatus = "queued" | "proposed" | "filed" | "discarded";

export type TriageCategory = "business-idea" | "ai-tip" | "ai-project" | "swe" | "other";

// Category-specific decision aid written by the nightly study step: for
// business ideas `detail` is a validity call (real opportunity or hype);
// for ai/swe content it's an exploration (what it is + how it works).
export interface TriageAssessment {
  verdict: string; // business-idea: pursue|maybe|pass — others: adopt|try|skim|skip
  detail: string;
  effort: string;
  payoff: string;
  apply: string; // concrete first step naming the project/centre, or "none"
}

export interface TriageProposal {
  summary: string;
  why_relevant: string;
  destination: string; // "vault" | "idea-bank" | "backlog:<centre>" | "roadmap:<project>" | "discard"
  confidence: "high" | "medium" | "low";
  rationale: string;
  // Added with the /decide cards (2026-07-11); absent on older proposals.
  title?: string;
  category?: TriageCategory;
  assessment?: TriageAssessment;
}

export interface TriageItem {
  id: string;
  url: string; // canonical
  rawUrl: string; // as captured
  source: TriageSource;
  savedAt: Date;
  status: TriageStatus;
  proposal?: TriageProposal;
  createdAt: Date;
}

const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com", "nitter.net"]);
const IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "instagr.am"]);

export function inferSource(url: string): TriageSource {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (X_HOSTS.has(host) || host.endsWith(".x.com")) return "x";
    if (IG_HOSTS.has(host)) return "instagram";
    return "other";
  } catch {
    return "other";
  }
}

/**
 * Canonical URL for dedup: lowercase host, strip tracking params (utm_*, t, s,
 * igsh, etc.), drop fragment and trailing slash. For X, collapse a status URL
 * to `x.com/i/status/<id>` (the same tweet is bookmarked under many handle
 * spellings incl. /i/); for IG, `instagram.com/{p,reel,tv}/<code>` without the
 * per-share query. Non-parseable input is returned trimmed, so a garbage URL
 * still dedups against itself.
 */
export function canonicalizeUrl(input: string): string {
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  const xMatch = u.pathname.match(/\/status(?:es)?\/(\d+)/);
  if ((X_HOSTS.has(host) || host.endsWith(".x.com")) && xMatch) {
    return `https://x.com/i/status/${xMatch[1]}`;
  }

  const igMatch = u.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (IG_HOSTS.has(host) && igMatch) {
    const kind = igMatch[1] === "reels" ? "reel" : igMatch[1];
    return `https://instagram.com/${kind}/${igMatch[2]}`;
  }

  const DROP = /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|s$|t$|ref$|ref_src$|ref_url$)/i;
  const keep = [...u.searchParams.entries()].filter(([k]) => !DROP.test(k));
  keep.sort(([a], [b]) => a.localeCompare(b));
  const qs = keep.map(([k, v]) => `${k}=${v}`).join("&");
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `https://${host}${path}${qs ? `?${qs}` : ""}`;
}
