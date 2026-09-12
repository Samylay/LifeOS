import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
import { POST } from "./route";

const result = (extra: Record<string, unknown> = {}) => ({
  api_version: "v1", request_id: "req-1", status: "completed", answer: "ok",
  structured_data: {}, actions: [], delegation_trace: [], citations: [], confidence: "high",
  escalation: null, job_id: null, ...extra,
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/chat/master", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("master route and client integration", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("LIFEOS_MASTER_ENABLED", "1");
    vi.stubEnv("LIFEOS_MASTER_URL", "https://master.example.test");
    vi.stubEnv("LIFEOS_MASTER_CLIENT_SECRET", "secret-value");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the exact governed envelope and projects a read-only result", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result()), { status: 200 }));
    const response = await POST(request({ requestId: "req-1", sessionId: "s-1", message: "hello", pageContext: { path: "/today" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ request_id: "req-1", answer: "ok", actions: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://master.example.test/v1/requests");
    expect(init.headers["x-master-client-id"]).toBe("lifeos");
    expect(JSON.parse(init.body)).toEqual({ api_version: "v1", request_id: "req-1", user_id: "local", client_id: "lifeos", interface: "lifeos.assistant", session_id: "s-1", message: "hello", page_context: { path: "/today" }, specialist_id: null, capability_hints: [], mode: "sync" });
  });

  it("maps a terminal provider failure to a safe typed 502", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ api_version: "v1", request_id: "req-1", status: "failed", error: { code: "provider_timeout", message: "private provider detail", retryable: true } }), { status: 200 }));
    const response = await POST(request({ requestId: "req-1", sessionId: "s-1", message: "hello" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ requestId: "req-1", retryable: true });
    expect(body.message).not.toContain("private provider detail");
  });

  it("retries transport failure with the identical envelope", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network detail")).mockResolvedValueOnce(new Response(JSON.stringify(result()), { status: 200 }));
    expect((await POST(request({ requestId: "req-1", sessionId: "s-1", message: "hello" }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  it("does not expose master actions", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result({ actions: [{ type: "write" }] })), { status: 200 }));
    const response = await POST(request({ requestId: "req-1", sessionId: "s-1", message: "hello" }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("invalid_result");
  });
});
