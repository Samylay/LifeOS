import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraftCacheForTests, getDraftSnapshot, saveCachedDraft, setCachedDraft } from "./draft-cache";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(clearDraftCacheForTests);

describe("content draft cache", () => {
  it("keeps a failed last edit through unmount/remount until it saves", async () => {
    setCachedDraft("idea-1", "stored", "unsaved final line");
    const first = deferred();
    const failed = saveCachedDraft("idea-1", "stored", "unsaved final line", vi.fn(() => first.promise));
    first.reject(new Error("offline"));
    await expect(failed).rejects.toThrow("offline");
    expect(getDraftSnapshot("idea-1", "stored")).toEqual({ draft: "unsaved final line", failed: true });

    await saveCachedDraft("idea-1", "stored", "unsaved final line", vi.fn(async () => {}));
    expect(getDraftSnapshot("idea-1", "newly stored")).toEqual({ draft: "newly stored", failed: false });
  });

  it("serializes writes from an old and a new card instance for the same idea", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldWrite = saveCachedDraft("idea-1", "stored", "older text", save);
    const newWrite = saveCachedDraft("idea-1", "stored", "newer text", save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("older text"));
    first.resolve();
    await oldWrite;
    await vi.waitFor(() => expect(save).toHaveBeenLastCalledWith("newer text"));
    second.resolve();
    await newWrite;
    expect(getDraftSnapshot("idea-1", "stored")).toEqual({ draft: "newer text", failed: false });
  });
});
