import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { claudeCliEnabled, runAgentTurn, create } = vi.hoisted(() => ({
  claudeCliEnabled: vi.fn(), runAgentTurn: vi.fn(), create: vi.fn(),
}));

vi.mock("@/lib/claude-cli", () => ({ claudeCliEnabled }));
vi.mock("@/lib/agent-engine", () => ({ APP_TOOLS: [], runAgentTurn }));
vi.mock("@/lib/ollama", () => ({ OLLAMA_MODEL: "test-model", getOllamaClient: () => ({ chat: { completions: { create } } }) }));
vi.mock("@/lib/app-actions", () => ({ executeAppActions: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/chat-log", () => ({ logChatMessage: vi.fn() }));
vi.mock("@/lib/homelab-resources", () => ({ searchHomelabResources: () => [] }));
vi.mock("@/lib/dev-requests", () => ({ addDevRequest: vi.fn(), validateDevRequestInput: vi.fn() }));

import { POST } from "./route";

const request = () => new NextRequest("http://localhost/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "hello" }], sessionId: "s1" }),
});

describe("existing chat provider paths", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.LIFEOS_MASTER_ENABLED = "1";
  });

  it("keeps the Claude path when master integration is enabled", async () => {
    claudeCliEnabled.mockReturnValue(true);
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
    claudeCliEnabled.mockReturnValue(false);
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "ollama reply" } }] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ reply: "ollama reply", actions: [] });
  });
});
