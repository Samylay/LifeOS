// The one write path into the content idea bank (`users/local/contentIdeas`,
// read by the content surface's `useContentIdeas` hook). Extracted from
// `triage-apply.ts`'s `fileToIdeaBank` (bookmark triage's "→ idea bank"
// action) so a second channel — voice (ticket 03) — files an idea through
// the exact same write instead of growing a second, drifting one
// (spec.md: "the idea bank gets its idea through the same path the content
// surface writes").
import { createDoc, deleteDoc } from "@/lib/server-db";
import type { ContentPillar } from "@/lib/types";

const COLLECTION = "users/local/contentIdeas";

export interface IdeaBankEntryInput {
  title: string;
  content?: string;
  // "" (unsorted, the default) is a real, expected value here — both
  // triage and voice hand off ideas with no pillar assigned yet; pillar
  // assignment happens on the content surface during review.
  pillar?: ContentPillar | "";
}

/** Files one idea. Returns the new doc id. Throws on write failure — the
 * caller decides what "recoverable" means for its own channel (voice keeps
 * the transcript in review; triage leaves the queue item unfiled). */
export function createIdeaBankEntry(input: IdeaBankEntryInput): string {
  const now = { __date: new Date().toISOString() };
  return createDoc(COLLECTION, {
    title: input.title.slice(0, 120),
    pillar: input.pillar ?? "",
    status: "idea",
    content: input.content ?? "",
    createdAt: now,
    updatedAt: now,
  });
}

/** Removes one idea by id (T-voice-rework-05's "move" — retracting a voice
 * capture from the idea bank once it has landed somewhere else instead).
 * Only ever called after the new destination write already succeeded. */
export function deleteIdeaBankEntry(id: string): void {
  deleteDoc(COLLECTION, id);
}
