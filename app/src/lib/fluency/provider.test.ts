import { afterAll, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fluency-provider-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmp, "test.db");
delete process.env.ELEVENLABS_API_KEY; delete process.env.FLUENCY_ELEVENLABS_AGENT_ID;
const { connect, connected, connectionInfo } = await import("./provider");
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fs.rmSync(path.join(tmp, "fluency-connection.json"), { force: true }); });
afterAll(() => { vi.unstubAllGlobals(); fs.rmSync(tmp, { recursive: true, force: true }); });
it("creates a dedicated private coach and never returns its API key", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ agent_id: "coach_test" })));
  expect(await connect("fixture-secret")).toEqual({ connected: true, agentId: "coach_test" });
  const [url, opts] = fetchMock.mock.calls[0], config = JSON.parse(opts.body);
  expect(url).toBe("https://api.elevenlabs.io/v1/convai/agents/create");
  expect(config.platform_settings.auth.enable_auth).toBe(true);
  expect(config.conversation_config.turn.turn_eagerness).toBe("patient");
  expect(config.conversation_config.agent.prompt.tool_ids).toBeUndefined();
  expect(connectionInfo()).toEqual({ connected: true, agentId: "coach_test" });
  expect(fs.statSync(path.join(tmp, "fluency-connection.json")).mode & 0o777).toBe(0o600);
});
it("does not persist a failed provider connection", async () => {
  fetchMock.mockResolvedValue(new Response("denied", { status: 401 }));
  await expect(connect("fixture-secret")).rejects.toThrow("401");
  expect(connected()).toBe(false);
});
it("refuses to attach the meal agent with action tools", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ conversation_config: { agent: { prompt: { prompt: "Meals {{meal_context}}", tool_ids: ["mutate_meal"] } } }, platform_settings: { auth: { enable_auth: true } } })));
  await expect(connect("fixture-secret", "meal_agent")).rejects.toThrow("dedicated training coach");
  expect(connected()).toBe(false);
});
