// Best-effort fetch of a saved item's source text — the network edge for
// ticket 03's passage extraction. This module never trusts what it fetches;
// it only ever hands raw text to passages.ts, which is the only place that
// text is turned into anything stored.
//
// Reuses the news engine's plain-text-via-Jina pattern
// (src/lib/news/engine.ts: JINA_PREFIX + Accept: text/plain, wrapped in an
// AbortSignal timeout) rather than inventing a second fetcher. Unlike the
// news engine, this module also refuses to even attempt a login-walled
// source — X/Instagram require a session no fetch here has, and Jina would
// either fail or return a login page, neither of which is a source of
// truth. Skipping before the request keeps that a policy decision, not an
// accident of what Jina happens to return.
//
// A fetch failure — timeout, non-2xx, no readable text — is always a normal
// outcome (empty result), never a thrown error the caller has to catch.
import { inferSource } from "../triage";

const JINA_PREFIX = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 25_000;
// Mirrors news/engine.ts's article-body cap — long enough for a real
// article's substance, short enough to keep candidate selection cheap.
const MAX_SOURCE_CHARS = 20_000;

const isYouTube = (url: string) => url.includes("youtube.com") || url.includes("youtu.be");

/** Whether a URL is worth even attempting to fetch: a real http(s) link,
 * not a known login-walled host (X/Instagram — see triage.ts's inferSource,
 * the same host list the triage pipeline already uses to recognize them),
 * and not a video page with no article text behind it. */
export function isReadableSource(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (isYouTube(url)) return false;
  const source = inferSource(url);
  if (source === "x" || source === "instagram") return false;
  return true;
}

/** Fetches the plain-text body of `url` via Jina's reader proxy. Returns
 * `null` — never throws — on any failure: timeout, non-2xx, or a
 * login-walled/unreadable source that isReadableSource already refused.
 * `null` and "no text" are the same outcome to every caller: no passages,
 * no error surface. */
export async function fetchSourceText(url: string): Promise<string | null> {
  if (!isReadableSource(url)) return null;
  try {
    const res = await fetch(JINA_PREFIX + url, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text) return null;
    return text.slice(0, MAX_SOURCE_CHARS);
  } catch {
    return null;
  }
}
