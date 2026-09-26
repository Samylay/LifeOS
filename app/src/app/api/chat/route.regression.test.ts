import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { codexEnabled, runAgentTurn, create, executeHomelabTool } = vi.hoisted(() => ({
  codexEnabled: vi.fn(), runAgentTurn: vi.fn(), create: vi.fn(), executeHomelabTool: vi.fn(),
}));

vi.mock("@/lib/claude-cli", () => ({ codexEnabled }));
vi.mock("@/lib/agent-engine", () => ({ APP_TOOLS: [], CHAT_TOOLS: [{ type: "function", function: { name: "search_lifeos_data" } }], runAgentTurn }));
vi.mock("@/lib/ollama", () => ({ OLLAMA_MODEL: "test-model", getOllamaClient: () => ({ chat: { completions: { create } } }) }));
vi.mock("@/lib/app-actions", () => ({ executeAppActions: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/chat-log", () => ({ logChatMessage: vi.fn() }));
vi.mock("@/lib/homelab-resources", () => ({ searchHomelabResources: () => [] }));

vi.mock("@/lib/homelab-tools", () => ({ HOMELAB_TOOL_NAMES: new Set(["search_lifeos_data"]), executeHomelabTool }));

import { POST } from "./route";

const request = (content = "hello") => new NextRequest("http://localhost/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content }], sessionId: "s1" }),
});

describe("existing chat provider paths", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LIFEOS_MASTER_ENABLED", "1");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the Claude path when master integration is enabled", async () => {
    codexEnabled.mockReturnValue(true);
    runAgentTurn.mockResolvedValue({ reply: "claude reply", clientActions: [], serverResults: [] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(runAgentTurn).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).toContain('"type":"final"');
    expect(body).toContain("claude reply");
  });

  it("keeps the Ollama path when master integration is enabled", async () => {
    codexEnabled.mockReturnValue(false);
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "ollama reply" } }] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ reply: "ollama reply", actions: [] });
  });

  it("passes raw user content unchanged through the Codex path", async () => {
    const content = "  Keep?! <raw> & casing\n\tintact  ";
    codexEnabled.mockReturnValue(true);
    runAgentTurn.mockResolvedValue({ reply: "ok", clientActions: [], serverResults: [] });

    await POST(request(content));

    expect(runAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      convoParts: [`USER: ${content}`],
    }));
  });

  it("passes raw user content unchanged through the Ollama path", async () => {
    const content = "  Keep?! <raw> & casing\n\tintact  ";
    codexEnabled.mockReturnValue(false);
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] });

    await POST(request(content));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({ role: "system" }),
        { role: "user", content },
      ],
    }));
  });
  it("gives Ollama the search tool and feeds its actual result back before answering", async () => {
    codexEnabled.mockReturnValue(false);
    executeHomelabTool.mockResolvedValue({ tool: "search_lifeos_data", summary: "Found one project", data: { title: "LifeOS" } });
    create.mockResolvedValueOnce({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "search-1", type: "function", function: { name: "search_lifeos_data", arguments: '{"query":"LifeOS"}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { content: "Found LifeOS" } }] });
    const response = await POST(request("Find LifeOS"));
    expect(executeHomelabTool).toHaveBeenCalledWith("search_lifeos_data", { query: "LifeOS" }, { requestId: undefined });
    expect(create.mock.calls[0][0].tools).toContainEqual(expect.objectContaining({ function: expect.objectContaining({ name: "search_lifeos_data" }) }));
    expect(create.mock.calls[1][0].messages).toContainEqual(expect.objectContaining({ role: "tool", content: JSON.stringify({ title: "LifeOS" }) }));
    expect(await response.json()).toMatchObject({ serverResults: [{ tool: "search_lifeos_data" }] });
  });

  it("explicitly forbids paraphrasing and preambles in the text assistant", async () => {
    codexEnabled.mockReturnValue(true);
    runAgentTurn.mockResolvedValue({ reply: "ok", clientActions: [], serverResults: [] });
    await POST(request());
    expect(runAgentTurn.mock.calls[0][0].systemPrompt).toContain("Do not rephrase, paraphrase, or echo");
  });

});
