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

// T47 (Samy 2026-07-14, option b): chat may QUEUE but never LAUNCH. One chat
// message is reachable from the phone, so a launch tool here means
// "phone message → effective root" (T29's threat model) via the sanctioned
// path. These assert the gap stays closed — the catalog is what the model can
// call, so a tool re-appearing there is the whole vulnerability.
describe("chat cannot launch a Claude session (T47)", () => {
  it("exposes no launch tool in the catalog the model sees", () => {
    const names = HOMELAB_TOOLS.map((t) => t.name);
    expect(names).not.toContain("launch_queued_prompts");
    expect(names.filter((n) => /launch|dispatch|start_/i.test(n))).toEqual([]);
    expect(HOMELAB_TOOL_NAMES.has("launch_queued_prompts")).toBe(false);
    expect(Object.keys(HOMELAB_TOOL_STATUS)).not.toContain("launch_queued_prompts");
  });

  it("offers no launch_now parameter on queue_homelab_prompt", () => {
    const q = HOMELAB_TOOLS.find((t) => t.name === "queue_homelab_prompt");
    expect(q).toBeDefined();
    expect(Object.keys(q!.parameters.properties)).toEqual(["title", "prompt"]);
  });

  it("queues without dispatching even when asked to launch_now", async () => {
    const before = listDocs(DISPATCH, {}).length;
    const r = await executeHomelabTool("queue_homelab_prompt", {
      title: "t47 probe",
      prompt: "launch this immediately",
      launch_now: true, // ignored by design: no such branch
    });
    expect(r.failed).toBeFalsy();
    // The prompt is queued...
    const queued = listDocs(QUEUE, { where: [["status", "==", "queued"]] });
    expect(queued.some((d) => (d as { title?: string }).title === "t47 probe")).toBe(true);
    // ...but nothing was handed to the host poller.
    expect(listDocs(DISPATCH, {}).length).toBe(before);
  });

  it("refuses an unknown launch tool name outright", async () => {
    const before = listDocs(DISPATCH, {}).length;
    const r = await executeHomelabTool("launch_queued_prompts", {});
    expect(r.failed).toBe(true);
    expect(listDocs(DISPATCH, {}).length).toBe(before);
  });
});
