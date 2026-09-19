import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { routeWithJev, requestMaster } = vi.hoisted(() => ({ routeWithJev: vi.fn(), requestMaster: vi.fn() }));
vi.mock("@/lib/jev-routing", () => ({ routeWithJev }));
vi.mock("@/lib/master-client", () => ({
  requestMaster,
  MasterClientError: class MasterClientError extends Error { code = "master_failed"; retryable = false; },
}));

import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/chat/jev", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("POST /api/chat/jev", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("JEV_ENABLED", "1");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-only");
    routeWithJev.mockResolvedValue({ route: "specialist", specialistId: "finance", confidence: "high", probability: 0.95, needsConfirmation: false, generalRequest: false, actionsAllowed: false });
    requestMaster.mockResolvedValue({ answer: "finance answer" });
  });

  it("is disabled unless explicitly enabled", async () => {
    vi.stubEnv("JEV_ENABLED", "0");
    expect((await POST(request({ requestId: "r1", sessionId: "s1", message: "hi" }))).status).toBe(404);
    expect(routeWithJev).not.toHaveBeenCalled();
  });

  it("refuses activation without the gateway key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect((await POST(request({ requestId: "r1", sessionId: "s1", message: "hi" }))).status).toBe(503);
    expect(routeWithJev).not.toHaveBeenCalled();
  });

  it("routes first, then uses the existing read-only master answer path", async () => {
    const response = await POST(request({ requestId: "r1", sessionId: "s1", message: "budget question" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ answer: "finance answer", decision: { specialistId: "finance", actionsAllowed: false }, actions: [] });
    expect(requestMaster).toHaveBeenCalledWith(expect.objectContaining({ specialistId: "finance" }), expect.anything());
  });

  it("does not call an answer provider for the low-confidence ask fallback", async () => {
    routeWithJev.mockResolvedValue({ route: "ask", specialistId: null, confidence: "low", probability: 0.4, needsConfirmation: false, generalRequest: true, actionsAllowed: false });
    expect((await POST(request({ requestId: "r1", sessionId: "s1", message: "unclear" }))).status).toBe(200);
    expect(requestMaster).not.toHaveBeenCalled();
  });
});
