import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { MasterClientError, requestMaster } from "./master-client";

const result = (extra: Record<string, unknown> = {}) => ({
  api_version: "v1", request_id: "req-1", status: "completed", answer: "ok",
  structured_data: {}, actions: [], delegation_trace: [], citations: [], confidence: "high",
  escalation: null, job_id: null, ...extra,
});

describe("requestMaster", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("LIFEOS_MASTER_URL", "https://master.example.test");
    vi.stubEnv("LIFEOS_MASTER_CLIENT_SECRET", "secret-value");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rejects an already cancelled request before contacting the master", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" }, { signal: controller.signal })).rejects.toMatchObject({ code: "request_cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing configuration and malformed JSON safely", async () => {
    vi.unstubAllEnvs();
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "master_configuration" });
    vi.stubEnv("LIFEOS_MASTER_URL", "https://master.example.test");
    vi.stubEnv("LIFEOS_MASTER_CLIENT_SECRET", "secret-value");
    fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "invalid_result", retryable: false, status: 200 });
  });

  it("sends the exact v1 envelope and returns a validated result", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result()), { status: 200 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello", pageContext: null })).resolves.toMatchObject({ answer: "ok" });
    const call = fetchMock.mock.calls[0];
    expect(call[0].toString()).toBe("https://master.example.test/v1/requests");
    expect(JSON.parse(call[1].body)).toEqual({ api_version: "v1", request_id: "req-1", user_id: "local", client_id: "lifeos", interface: "lifeos.assistant", session_id: "s-1", message: "hello", page_context: null, specialist_id: null, capability_hints: [], mode: "sync" });
    expect(call[1].headers["x-master-client-secret"]).toBe("secret-value");
  });

  it("rejects credentials and query or fragment in configured URLs", async () => {
    for (const url of ["https://u:p@master.example.test", "https://master.example.test?secret=x", "https://master.example.test#x"]) {
      vi.stubEnv("LIFEOS_MASTER_URL", url);
      await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "master_configuration" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never exposes the configured secret or provider message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "provider_failed", message: "TOP SECRET PROVIDER DETAIL", retryable: false }), { status: 502 }));
    const error = await requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" }).catch((e) => e);
    expect(error).toBeInstanceOf(MasterClientError);
    expect(String(error)).not.toContain("TOP SECRET");
    expect(String(error)).not.toContain("secret-value");
  });

  it("retries one transport failure with the identical body", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network detail")).mockResolvedValueOnce(new Response(JSON.stringify(result()), { status: 200 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).resolves.toMatchObject({ answer: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  it("does not retry HTTP failures and preserves idempotency conflicts", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "provider_failed", retryable: true }), { status: 502 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "provider_failed", status: 502, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ code: "idempotency_conflict", retryable: false }), { status: 409 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "idempotency_conflict", status: 409, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry terminal 200 failures, actions, job states, or mismatched IDs", async () => {
    for (const payload of [
      { ...result({ status: "failed", error: { code: "provider_failed", retryable: true } }) },
      result({ actions: [{ type: "danger" }] }), result({ status: "accepted" }), result({ request_id: "other" }),
    ]) {
      fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
      await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toBeInstanceOf(MasterClientError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("maps a terminal provider timeout result without exposing its detail", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ api_version: "v1", request_id: "req-1", status: "failed", error: { code: "provider_timeout", message: "private detail", retryable: true } }), { status: 200 }));
    await expect(requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" })).rejects.toMatchObject({ code: "provider_timeout", retryable: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps cancellation and timeout without leaking transport details", async () => {
    const abort = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("raw")));
    }));
    const pending = requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" }, { signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: "request_cancelled", retryable: false });

    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("raw timeout")));
    }));
    const timed = requestMaster({ requestId: "req-1", sessionId: "s-1", message: "hello" });
    const timedAssertion = expect(timed).rejects.toMatchObject({ code: "request_timeout", retryable: true });
    await vi.advanceTimersByTimeAsync(30_001);
    await timedAssertion;
    vi.useRealTimers();
  });
});
