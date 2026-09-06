// Orchestration for ticket 03: turns one saved (triage) item into stored
// passages. This is the thin I/O glue — fetch, ask a model which spans look
// worth keeping, persist what survives — around the two pure modules that
// carry the actual house law:
//   - source-fetch.ts decides whether a URL is even worth attempting and
//     fetches its text, never throwing;
//   - passages.ts is the only place a candidate span can become a stored
//     ExtractedPassage, and it refuses anything that doesn't slice back to
//     an exact match.
// No test in this file re-proves either law; extract-item.test.ts only
// asserts the wiring (login wall / unreadable source → no passages, no
// error; re-running doesn't duplicate; only saved items are ever read).
import { createDoc, listDocs } from "../server-db";
import { generateJson } from "../claude-cli";
import type { TriageItem, TriageStatus } from "../triage";
import { fetchSourceText } from "./source-fetch";
import { extractPassages, MAX_PASSAGES_PER_ITEM, type ExtractedPassage, type PassageCandidate } from "./passages";

export const PASSAGES_COLLECTION = "users/local/knowledgePassages";

// "Saved" means Samy explicitly approved the item, not merely that a
// grabber discovered it. "queued" is an unreviewed inbox item; "discarded"
// and "deferred" are explicit non-saves. "filed" and "done" are the two
// states an approved item can be in (done = already handed off to an
// agent) — both mean Samy kept it.
const SAVED_STATUSES: ReadonlySet<TriageStatus> = new Set(["filed", "done"]);

/** Whether an item is material Samy explicitly saved — the only material
 * this module (or anything built on it) is allowed to read source text
 * for. Exported so callers can filter their own item lists before ever
 * reaching this module, keeping "only saved items are read" checkable at
 * more than one point. */
export function isSavedItem(item: Pick<TriageItem, "status">): boolean {
  return SAVED_STATUSES.has(item.status);
}

function candidatePrompt(sourceText: string): string {
  return `You are choosing, not writing. Below is the plain text of an article. Pick up to 3 short passages (20-400 characters each) that are worth resurfacing later — genuinely interesting or memorable sentences or short spans, copied EXACTLY as they appear in the text below. Do not paraphrase, translate, summarize, or alter a single character.

Reply with JSON only: an array of objects, each { "quote": "<the exact substring>" }. If nothing is worth keeping, reply with [].

TEXT:
"""
${sourceText}
"""`;
}

/** Asks a model to choose candidate spans by quoting them back. The model's
 * claimed quote is untrusted input: candidatesFromModelQuotes only turns it
 * into a PassageCandidate by locating that exact string in the source via
 * indexOf and recording the offsets where it actually occurs. A quote the
 * model altered even slightly will not be found and produces no candidate
 * — extractPassages's verbatim check is a second, independent gate on top
 * of this, so the law holds even if this function has a bug. */
export function candidatesFromModelQuotes(sourceText: string, quotes: string[]): PassageCandidate[] {
  const candidates: PassageCandidate[] = [];
  const takenStarts = new Set<number>();
  for (const raw of quotes) {
    if (typeof raw !== "string" || !raw) continue;
    const start = sourceText.indexOf(raw);
    if (start === -1 || takenStarts.has(start)) continue;
    takenStarts.add(start);
    candidates.push({ start, end: start + raw.length, quote: raw });
  }
  return candidates;
}

/** Never throws: a broken or empty model response yields no candidates,
 * which yields no passages — the same "no passages" outcome as an
 * unreadable source, not an error. */
async function selectCandidates(sourceText: string): Promise<PassageCandidate[]> {
  try {
    const parsed = await generateJson<Array<{ quote?: string }>>(candidatePrompt(sourceText));
    if (!Array.isArray(parsed)) return [];
    const quotes = parsed.map((c) => c?.quote).filter((q): q is string => typeof q === "string");
    return candidatesFromModelQuotes(sourceText, quotes);
  } catch {
    return [];
  }
}

function existingPassages(sourceItemId: string): ExtractedPassage[] {
  return listDocs(PASSAGES_COLLECTION, { where: [["sourceItemId", "==", sourceItemId]] }) as unknown as ExtractedPassage[];
}

/** Extracts and persists passages for one saved item. Returns the passages
 * newly stored by this call (empty on a login wall, a dead link, a source
 * with nothing worth keeping, or an item that was never saved) — always a
 * normal, silent empty array, never a thrown error. Idempotent: re-running
 * over the same item tops up toward the per-item bound without duplicating
 * anything already stored. */
export async function extractPassagesForItem(item: TriageItem): Promise<ExtractedPassage[]> {
  if (!isSavedItem(item)) return [];

  const sourceText = await fetchSourceText(item.url);
  if (!sourceText) return [];

  const already = existingPassages(item.id);
  if (already.length >= MAX_PASSAGES_PER_ITEM) return [];

  const title = item.proposal?.title || item.rawUrl;
  const candidates = await selectCandidates(sourceText);
  const fresh = extractPassages({ id: item.id, title, url: item.url }, sourceText, candidates, already);

  for (const passage of fresh) {
    createDoc(PASSAGES_COLLECTION, { ...passage });
  }
  return fresh;
}
