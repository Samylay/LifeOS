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
const { dispatchQueuedPrompts, HOMELAB_TOOLS, HOMELAB_TOOL_NAMES, HOMELAB_TOOL_STATUS, executeHomelabTool } =
  await import("./homelab-tools");

const QUEUE = "users/local/promptQueue";
const DISPATCH = "users/local/promptDispatch";
const TRIAGE = "users/local/triageQueue";

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

  it("retires the source triage item (filed → done) when its prompt is dispatched", () => {
    const itemId = createDoc(TRIAGE, { status: "filed", url: "https://x.com/i/status/1", filedAs: "approve" });
    createDoc(QUEUE, {
      itemId, title: "treated card", prompt: "act on this",
      status: "queued", queuedAt: { __date: new Date().toISOString() },
    });
    const r = dispatchQueuedPrompts();
    expect(r.ok).toBe(true);
    expect(getDoc(TRIAGE, itemId)).toMatchObject({ status: "done" });
  });

  it("never clobbers a non-filed item (a late discard stays discarded)", () => {
    const itemId = createDoc(TRIAGE, { status: "discarded", url: "https://x.com/i/status/2" });
    createDoc(QUEUE, {
      itemId, title: "discarded card", prompt: "act on this",
      status: "queued", queuedAt: { __date: new Date().toISOString() },
    });
    const r = dispatchQueuedPrompts();
    expect(r.ok).toBe(true);
    expect(getDoc(TRIAGE, itemId)).toMatchObject({ status: "discarded" });
  });
});

describe("chat cannot dispatch work (T47)", () => {
  it("exposes no direct execution tool", () => {
    const names = HOMELAB_TOOLS.map((t) => t.name);
    expect(names).not.toContain("execute_homelab_prompt");
    expect(names.filter((name) => /launch|dispatch|execute_homelab_prompt/i.test(name))).toEqual([]);
    expect(HOMELAB_TOOL_NAMES.has("execute_homelab_prompt")).toBe(false);
    expect(Object.keys(HOMELAB_TOOL_STATUS)).not.toContain("execute_homelab_prompt");
  });

  it("keeps run_now as a confirmation request, not a dispatch control", () => {
    const q = HOMELAB_TOOLS.find((t) => t.name === "queue_homelab_prompt");
    expect(q).toBeDefined();
    expect(Object.keys(q!.parameters.properties)).toEqual(["title", "prompt", "run_now"]);
    expect(q!.parameters.properties.run_now.type).toBe("boolean");
  });

  it("queues a run-now request with a confirm chip and does not dispatch", async () => {
    const before = listDocs(DISPATCH, {}).length;
    const r = await executeHomelabTool("queue_homelab_prompt", {
      title: "t47 probe",
      prompt: "launch this immediately",
      run_now: true,
    });
    expect(r.failed).toBeFalsy();
    expect(r.confirm).toMatchObject({ title: "t47 probe" });
    const queued = listDocs(QUEUE, { where: [["status", "==", "queued"]] });
    expect(queued.some((d) => (d as { title?: string }).title === "t47 probe")).toBe(true);
    expect(listDocs(DISPATCH, {}).length).toBe(before);
  });

  it("refuses an unknown direct execution tool", async () => {
    const before = listDocs(DISPATCH, {}).length;
    const r = await executeHomelabTool("execute_homelab_prompt", {});
    expect(r.failed).toBe(true);
    expect(listDocs(DISPATCH, {}).length).toBe(before);
  });
});
