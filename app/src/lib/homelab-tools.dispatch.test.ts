import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { startCodexSession, getCodexSessions } = vi.hoisted(() => ({ startCodexSession: vi.fn(), getCodexSessions: vi.fn() }));
vi.mock("./codex-sessions", () => ({ startCodexSession, getCodexSessions }));

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

describe("explicit chat execution (Samy, 2026-09-26, replaces T47)", () => {
  it("exposes direct start and monitoring tools", () => {
    expect(HOMELAB_TOOL_NAMES.has("start_codex_session")).toBe(true);
    expect(HOMELAB_TOOL_NAMES.has("get_codex_sessions")).toBe(true);
    expect(HOMELAB_TOOL_STATUS.start_codex_session).toBeDefined();
  });
  it("starts immediately without creating queue or dispatch records", async () => {
    const beforeQueue = listDocs(QUEUE).length, beforeDispatch = listDocs(DISPATCH).length;
    startCodexSession.mockResolvedValue({ id: "a".repeat(32), title: "Fix chat", status: "running" });
    const result = await executeHomelabTool("start_codex_session", { title: "Fix chat", prompt: "Fix and verify" }, { requestId: "r1" });
    expect(startCodexSession).toHaveBeenCalledWith("Fix chat", "Fix and verify", "r1");
    expect(result.data).toMatchObject({ status: "running" });
    expect(result.confirm).toBeUndefined();
    expect(listDocs(QUEUE)).toHaveLength(beforeQueue);
    expect(listDocs(DISPATCH)).toHaveLength(beforeDispatch);
  });
  it("launches legacy run_now requests directly", async () => {
    const before = listDocs(QUEUE).length;
    await executeHomelabTool("queue_homelab_prompt", { title: "Fix chat", prompt: "Fix and verify", run_now: true });
    expect(listDocs(QUEUE)).toHaveLength(before);
  });
  it("reports a failed launch without queueing or claiming success", async () => {
    startCodexSession.mockRejectedValueOnce(new Error("Host unavailable"));
    const result = await executeHomelabTool("start_codex_session", { title: "Fix", prompt: "Fix it" });
    expect(result.failed).toBe(true);
    expect(result.data).toEqual({ error: "Host unavailable" });
  });
  it("reads actual session progress and final results", async () => {
    getCodexSessions.mockResolvedValue([{ id: "a".repeat(32), status: "completed", answer: "Verified" }]);
    const result = await executeHomelabTool("get_codex_sessions", { id: "a".repeat(32) });
    expect(result.data).toMatchObject({ sessions: [{ status: "completed", answer: "Verified" }] });
  });
});
