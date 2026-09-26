import { afterEach, expect, it, vi } from "vitest";
import { getCodexSessions, startCodexSession } from "./codex-sessions";
afterEach(() => vi.unstubAllGlobals());
it("deduplicates the same user request even if the model rewrites its brief", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "a".repeat(32), status: "running" }) });
  vi.stubGlobal("fetch", fetch);
  await startCodexSession("Fix chat", "First wording", "user-turn-1");
  await startCodexSession("Fix chat", "Rewritten wording", "user-turn-1");
  expect(JSON.parse(fetch.mock.calls[0][1].body).requestId).toBe(JSON.parse(fetch.mock.calls[1][1].body).requestId);
});
it("reports host failure instead of returning a queued success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Host unavailable" }) }));
  await expect(startCodexSession("Fix", "Requested work")).rejects.toThrow("Host unavailable");
});
it("rejects invalid monitor ids before contacting the host", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(getCodexSessions("../secret")).rejects.toThrow("Invalid Codex session id");
  expect(fetch).not.toHaveBeenCalled();
});
