import { describe, expect, it, vi } from "vitest";
import { createDraftSaveQueue } from "./draft-save-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("createDraftSaveQueue", () => {
  it("writes edits in order so an older request cannot overwrite the newest prose", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queue = createDraftSaveQueue();

    const firstWrite = queue.enqueue("first edit", save);
    const secondWrite = queue.enqueue("latest edit", save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("first edit"));
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve();
    await firstWrite;
    await vi.waitFor(() => expect(save).toHaveBeenLastCalledWith("latest edit"));

    second.resolve();
    await secondWrite;
  });

  it("continues with the latest edit after an earlier request fails", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queue = createDraftSaveQueue();

    const firstWrite = queue.enqueue("older edit", save);
    const secondWrite = queue.enqueue("latest edit", save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("older edit"));
    first.reject(new Error("offline"));
    await expect(firstWrite).rejects.toThrow("offline");
    await vi.waitFor(() => expect(save).toHaveBeenLastCalledWith("latest edit"));

    second.resolve();
    await secondWrite;
  });
});
