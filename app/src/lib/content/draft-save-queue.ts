/**
 * Serializes draft writes. Without this, a slow earlier save can finish after
 * a newer one and overwrite it. The queue also keeps a later edit moving when
 * an earlier request fails.
 */
export function createDraftSaveQueue() {
  let tail = Promise.resolve();

  return {
    enqueue(body: string, save: (body: string) => Promise<void>) {
      const next = tail.catch(() => undefined).then(() => save(body));
      tail = next;
      return next;
    },
  };
}
