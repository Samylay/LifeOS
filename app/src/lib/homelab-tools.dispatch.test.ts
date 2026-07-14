import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Throwaway DB before the lazy singleton opens (mirrors server-db.test.ts).
// The singleton binds on first query, so the path can't change mid-file —
// isolation instead comes from dispatch flipping each seeded item to
// "dispatched", so a later test's fresh "queued" seed never sees stale rows.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-dispatch-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc, listDocs, getDoc } = await import("./server-db");
const { dispatchQueuedPrompts } = await import("./homelab-tools");

const QUEUE = "users/local/promptQueue";
const DISPATCH = "users/local/promptDispatch";

function seed(n: number, promptLen = 100) {
  for (let i = 0; i < n; i++) {
    createDoc(QUEUE, {
      itemId: `it-${Math.random().toString(36).slice(2)}`,
      title: `card ${i}`,
      prompt: "x".repeat(promptLen),
      status: "queued",
      queuedAt: { __date: new Date(Date.now() + i).toISOString() },
    });
  }
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("dispatchQueuedPrompts batching", () => {
  it("errors when the queue is empty", () => {
    // runs first, before any seed
    expect(dispatchQueuedPrompts().ok).toBe(false);
  });

  it("puts a small queue in a single dispatch doc", () => {
    seed(3);
    const r = dispatchQueuedPrompts();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itemCount).toBe(3);
    expect(r.batchCount).toBe(1);
    expect(r.dispatchIds).toHaveLength(1);
    expect(getDoc(DISPATCH, r.dispatchIds[0])).toMatchObject({ itemCount: 3 });
    expect(listDocs(QUEUE, { where: [["status", "==", "queued"]] })).toHaveLength(0);
  });

  it("splits past the item cap (8) into multiple dispatch docs", () => {
    seed(10);
    const r = dispatchQueuedPrompts();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itemCount).toBe(10);
    expect(r.batchCount).toBe(2); // 8 + 2
    const counts = r.dispatchIds.map((id) => (getDoc(DISPATCH, id) as unknown as { itemCount: number }).itemCount);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("splits past the character budget even under the item cap", () => {
    seed(3, 20_000); // 3 × 20k chars > 24k budget → can't share one brief
    const r = dispatchQueuedPrompts();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batchCount).toBe(3);
  });
});
