import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requestMaster } = vi.hoisted(() => ({ requestMaster: vi.fn() }));
vi.mock("@/lib/master-client", () => ({
  requestMaster,
  MasterClientError: class MasterClientError extends Error {
    code = "master_error";
    retryable = false;
    status = 502;
  },
}));

import { POST } from "./route";

const request = (body: unknown, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest("http://localhost/api/chat/master", {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });

describe("POST /api/chat/master", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LIFEOS_MASTER_ENABLED", "1");
    requestMaster.mockResolvedValue({ status: "completed", api_version: "v1", request_id: "retry_01", answer: "hello", structured_data: {}, actions: [], delegation_trace: [], citations: [], confidence: "high", escalation: null, job_id: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("is disabled by default", async () => {
    vi.stubEnv("LIFEOS_MASTER_ENABLED", "0");
    const response = await POST(request({ requestId: "r1", sessionId: "s1", message: "hi" }));
    expect(response.status).toBe(404);
    expect(requestMaster).not.toHaveBeenCalled();
  });

  it("passes the stable request id and abort signal to the client", async () => {
    const response = await POST(request({ requestId: "retry_01", sessionId: "s1", message: "hi", pageContext: { path: "/today", title: "Today" } }));
    expect(response.status).toBe(200);
    expect(requestMaster).toHaveBeenCalledWith(
      { requestId: "retry_01", sessionId: "s1", message: "hi", pageContext: { path: "/today", title: "Today" } },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it.each([
    { provider: "ollama" },
    { requestId: "r1", sessionId: "s1", message: "hi", user_id: "samy" },
    { requestId: "r1", sessionId: "s1", message: "hi", pageContext: { path: "/", actions: [] } },
    { requestId: "r1", sessionId: "s1", message: "hi", pageContext: { path: "" } },
    { requestId: "r1", sessionId: "s1", message: "   " },
    { requestId: "x".repeat(129), sessionId: "s1", message: "hi" },
    { requestId: "r1", sessionId: "s1", message: "hi", pageContext: { path: "x".repeat(257) } },
    { requestId: "r1", sessionId: "s1", message: "hi", pageContext: { path: "/", title: "x".repeat(201) } },
    { requestId: "r1", sessionId: "s1", message: "hi", pageContext: { path: "/", summary: "x".repeat(4001) } },
    { requestId: "r1", sessionId: "s1", message: "hi", grant: "admin" },
    { requestId: "r1", sessionId: "s1", message: "hi", capability_hints: ["write"] },
  ])("rejects malformed or privileged input %#", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(requestMaster).not.toHaveBeenCalled();
  });

  it("rejects oversized messages and streamed bodies", async () => {
    const response = await POST(request({ requestId: "r1", sessionId: "s1", message: "x".repeat(20_001) }));
    expect(response.status).toBe(400);
    const oversized = new NextRequest("http://localhost/api/chat/master", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "r1", sessionId: "s1", message: "x".repeat(31_000), extra: "x".repeat(2_000) }),
    });
    expect((await POST(oversized)).status).toBe(413);
  });

  it("never forwards master actions or needs_action to the browser", async () => {
    requestMaster.mockResolvedValue({ status: "needs_action", api_version: "v1", request_id: "r1", answer: "approve?", actions: [{ type: "write" }] });
    const response = await POST(request({ requestId: "r1", sessionId: "s1", message: "do it" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ code: "unsafe_result" });
    expect(body).not.toHaveProperty("actions");
  });

  it("maps a master failed result to a typed retryable error", async () => {
    requestMaster.mockResolvedValue({ status: "failed", api_version: "v1", request_id: "r1", answer: "provider details" });
    const response = await POST(request({ requestId: "r1", sessionId: "s1", message: "hi" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "master_failed", retryable: true, requestId: "r1" });
  });
});
