// Passage extraction — turns a saved item's fetched source text into a
// bounded set of verbatim passages, or nothing at all.
//
// Spec: .scratch/knowledge-rework/spec.md, ticket 03
// (.scratch/knowledge-rework/issues/03-passages-from-saved-sources.md).
//
// The house law: extraction is SELECTION, never generation. A model (or any
// other caller) may propose a candidate span — offsets plus the text it
// claims lives there — but this module is the only place a candidate is
// ever turned into a stored passage, and it does that by re-deriving the
// quote from the source text at those offsets and refusing the candidate
// outright unless the two agree character-for-character. There is no path
// from "the model said this text" to a stored passage without that check,
// so a paraphrase, a translation, a tidied-up quote, or an out-of-range
// offset cannot become a passage by construction — the same discipline
// review.ts applies to buildCard(), applied one step earlier, to untrusted
// input instead of trusted state.
//
// Pure: no filesystem, no database, no network, no model call. Callers
// fetch the source text and gather candidates (however a model proposes
// them); this module only ever decides which candidates survive.

/** What a candidate span claims about the source text. `quote` is the
 * candidate's own claim, not yet trusted — verifyCandidate is what checks
 * it against the real source before anything is built from it. */
export interface PassageCandidate {
  start: number;
  end: number;
  quote: string;
}

/** A passage that has survived verification: its quote is guaranteed to be
 * `text.slice(start, end)` at the moment it was built, and it always
 * carries the saved item it came from plus that item's own attribution —
 * there is no variant of this type that omits provenance. */
export interface ExtractedPassage {
  sourceItemId: string;
  title: string;
  url: string;
  text: string;
  start: number;
  end: number;
  quote: string;
}

/** Bounded — a saved item never yields an unbounded stream of passages,
 * regardless of how many candidates a model proposes. */
export const MAX_PASSAGES_PER_ITEM = 3;

// A quote too short is a fragment, not a passage worth resurfacing; one too
// long defeats the point of a quote (and risks swallowing whole articles).
export const MIN_QUOTE_CHARS = 20;
export const MAX_QUOTE_CHARS = 600;

/** The single gate every candidate must pass. Refuses:
 *  - offsets outside the source text (negative start, end past the text's
 *    length, or an empty/inverted span) — never truncates or clamps, since
 *    a truncated quote is exactly the "near enough" failure mode this
 *    module exists to reject;
 *  - a claimed quote that does not exactly equal the source text sliced at
 *    those offsets — this is what catches an altered, paraphrased, or
 *    merely near-matching quote;
 *  - a quote outside the length bounds.
 */
export function verifyCandidate(sourceText: string, candidate: PassageCandidate): boolean {
  const { start, end, quote } = candidate;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end <= start || end > sourceText.length) return false;
  const slice = sourceText.slice(start, end);
  if (slice !== quote) return false;
  if (slice.length < MIN_QUOTE_CHARS || slice.length > MAX_QUOTE_CHARS) return false;
  return true;
}

function passageKey(start: number, end: number): string {
  return `${start}:${end}`;
}

/** The rule: given a saved item's source text and a set of proposed
 * candidates, which ones become stored passages. `alreadyExtracted` is
 * whatever this item has already produced in a previous run — re-running
 * over the same item never duplicates a passage already taken (same
 * offsets) and never exceeds the per-item bound across runs. */
export function extractPassages(
  item: { id: string; title: string; url: string },
  sourceText: string,
  candidates: PassageCandidate[],
  alreadyExtracted: ExtractedPassage[] = []
): ExtractedPassage[] {
  const existingForItem = alreadyExtracted.filter((p) => p.sourceItemId === item.id);
  const seen = new Set(existingForItem.map((p) => passageKey(p.start, p.end)));
  let remaining = MAX_PASSAGES_PER_ITEM - existingForItem.length;
  const out: ExtractedPassage[] = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (!verifyCandidate(sourceText, candidate)) continue;
    const key = passageKey(candidate.start, candidate.end);
    if (seen.has(key)) continue;
    seen.add(key);
    remaining -= 1;
    out.push({
      sourceItemId: item.id,
      title: item.title,
      url: item.url,
      text: sourceText,
      start: candidate.start,
      end: candidate.end,
      quote: candidate.quote,
    });
  }
  return out;
}
