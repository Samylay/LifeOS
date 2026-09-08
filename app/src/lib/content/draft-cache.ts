import { createDraftSaveQueue } from "./draft-save-queue";

type DraftEntry = {
  draft: string;
  source: string;
  dirty: boolean;
  failed: boolean;
  queue: ReturnType<typeof createDraftSaveQueue>;
};

const entries = new Map<string, DraftEntry>();

function entryFor(ideaId: string, stored: string): DraftEntry {
  const existing = entries.get(ideaId);
  if (existing) {
    if (!existing.dirty && stored !== existing.source) {
      existing.draft = stored;
      existing.source = stored;
    }
    return existing;
  }
  const entry = { draft: stored, source: stored, dirty: false, failed: false, queue: createDraftSaveQueue() };
  entries.set(ideaId, entry);
  return entry;
}

export function getDraftSnapshot(ideaId: string, stored: string) {
  const entry = entryFor(ideaId, stored);
  return { draft: entry.draft, failed: entry.failed };
}

export function setCachedDraft(ideaId: string, stored: string, draft: string) {
  const entry = entryFor(ideaId, stored);
  entry.draft = draft;
  entry.dirty = true;
  entry.failed = false;
}

/** Keeps pending prose and its queue by idea id across card remounts. */
export function saveCachedDraft(
  ideaId: string,
  stored: string,
  draft: string,
  save: (body: string) => Promise<void>,
) {
  const entry = entryFor(ideaId, stored);
  entry.draft = draft;
  entry.dirty = true;
  entry.failed = false;
  const write = entry.queue.enqueue(draft, save);
  return write.then(
    () => {
      if (entry.draft === draft) {
        entry.dirty = false;
        entry.failed = false;
      }
    },
    (error: unknown) => {
      if (entry.draft === draft) entry.failed = true;
      throw error;
    },
  );
}

export function clearDraftCacheForTests() {
  entries.clear();
}
