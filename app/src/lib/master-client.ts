import "server-only";

export type PageContext = { path: string; title?: string; summary?: string };
export type MasterConfidence = "high" | "medium" | "low" | "unknown";

export type MasterRequest = {
  requestId: string;
  sessionId: string;
  message: string;
  pageContext?: PageContext | null;
};

export type MasterRequestV1 = {
  api_version: "v1";
  request_id: string;
  user_id: "local";
  client_id: "lifeos";
  interface: "lifeos.assistant";
  session_id: string;
  message: string;
  page_context: PageContext | null;
  specialist_id: null;
  capability_hints: [];
  mode: "sync";
};

export type MasterResultV1 = {
  api_version: "v1";
  request_id: string;
  status: "completed" | "partial";
  answer: string | null;
  structured_data: Record<string, unknown>;
  actions: [];
  delegation_trace: unknown[];
  citations: unknown[];
  confidence: MasterConfidence;
  escalation: null | Record<string, unknown>;
  job_id: null;
};

type MasterErrorBody = { code?: unknown; retryable?: unknown; request_id?: unknown };

const SAFE_MESSAGES: Record<string, string> = {
  authentication_failed: "Master authentication failed",
  invalid_request: "Master rejected the request",
  idempotency_conflict: "Master request ID is already in use",
  provider_unavailable: "Master provider is unavailable",
  provider_failed: "Master provider failed",
  request_timeout: "Master request timed out",
  request_cancelled: "Master request was cancelled",
  invalid_result: "Master returned an invalid result",
  master_unavailable: "Master service is unavailable",
  master_configuration: "Master client is not configured",
  master_failed: "Master request failed",
  provider_timeout: "Master provider timed out",
  provider_http_error: "Master provider returned an HTTP error",
  provider_invalid_response: "Master provider returned an invalid response",
  master_instructions_unavailable: "Master instructions are unavailable",
};

export class MasterClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(code: string, retryable: boolean, status: number | null, requestId: string | null) {
    super(SAFE_MESSAGES[code] ?? "Master request failed");
    this.name = "MasterClientError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.requestId = requestId;
  }
}

function configuredUrl(): URL {
  const raw = process.env.LIFEOS_MASTER_URL;
  if (!raw) throw new MasterClientError("master_configuration", false, null, null);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MasterClientError("master_configuration", false, null, null);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new MasterClientError("master_configuration", false, null, null);
  }
  return url;
}

function requestEnvelope(input: MasterRequest): MasterRequestV1 {
  if (typeof input.requestId !== "string" || typeof input.sessionId !== "string" || typeof input.message !== "string" ||
      !input.requestId.trim() || !input.sessionId.trim() || !input.message.trim()) {
    throw new MasterClientError("invalid_request", false, 400, typeof input.requestId === "string" ? input.requestId || null : null);
  }
  if (input.pageContext !== undefined && input.pageContext !== null && (!input.pageContext.path || typeof input.pageContext.path !== "string")) {
    throw new MasterClientError("invalid_request", false, 400, input.requestId);
  }
  return {
    api_version: "v1",
    request_id: input.requestId,
    user_id: "local",
    client_id: "lifeos",
    interface: "lifeos.assistant",
    session_id: input.sessionId,
    message: input.message,
    page_context: input.pageContext ?? null,
    specialist_id: null,
    capability_hints: [],
    mode: "sync",
  } satisfies MasterRequestV1;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function bodyError(body: unknown, status: number, requestId: string): MasterClientError {
  const data = body && typeof body === "object" ? body as MasterErrorBody : {};
  const code = typeof data.code === "string" && SAFE_MESSAGES[data.code] ? data.code : status >= 500 ? "provider_http_error" : "master_failed";
  const retryable = typeof data.retryable === "boolean" ? data.retryable : retryableStatus(status);
  return new MasterClientError(code, retryable, status, requestId);
}

function validResult(value: unknown, requestId: string): value is MasterResultV1 {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const citationsValid = Array.isArray(result.citations) && result.citations.every((citation) => {
    if (!citation || typeof citation !== "object") return false;
    const source = (citation as Record<string, unknown>).source;
    return typeof source === "string" && source.trim().length > 0;
  });
  return result.api_version === "v1" && result.request_id === requestId &&
    (result.status === "completed" || result.status === "partial") &&
    (typeof result.answer === "string" || result.answer === null) &&
    !!result.structured_data && typeof result.structured_data === "object" && !Array.isArray(result.structured_data) &&
    Array.isArray(result.actions) && result.actions.length === 0 && Array.isArray(result.delegation_trace) &&
    citationsValid && ["high", "medium", "low", "unknown"].includes(result.confidence as string) &&
    (result.status === "completed" ? result.escalation === null : (result.escalation === null || (typeof result.escalation === "object" && !Array.isArray(result.escalation)))) && result.job_id === null;
}

export async function requestMaster(input: MasterRequest, options: { signal?: AbortSignal } = {}): Promise<MasterResultV1> {
  const envelope = requestEnvelope(input);
  if (options.signal?.aborted) throw new MasterClientError("request_cancelled", false, null, input.requestId);
  const body = JSON.stringify(envelope);
  const url = configuredUrl();
  if (!process.env.LIFEOS_MASTER_CLIENT_SECRET) throw new MasterClientError("master_configuration", false, null, input.requestId);
  const timeout = 15_000;
  const secret = process.env.LIFEOS_MASTER_CLIENT_SECRET;
  if (!secret) throw new MasterClientError("master_configuration", false, null, input.requestId);
  let lastError: MasterClientError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      const response = await fetch(new URL("/v1/requests", url), {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "content-type": "application/json", "x-master-client-id": "lifeos", "x-master-client-secret": secret },
        body,
      });
      let parsed: unknown;
      try { parsed = await response.json(); } catch {
        if (options.signal?.aborted) throw new MasterClientError("request_cancelled", false, null, input.requestId);
        if (timedOut) throw new MasterClientError("request_timeout", true, null, input.requestId);
        throw new MasterClientError("invalid_result", false, 200, input.requestId);
      }
      if (options.signal?.aborted) throw new MasterClientError("request_cancelled", false, null, input.requestId);
      if (!response.ok) {
        const error = bodyError(parsed, response.status, input.requestId);
        throw error;
      }
      if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).status === "failed") {
        if ((parsed as Record<string, unknown>).api_version !== "v1" || (parsed as Record<string, unknown>).request_id !== input.requestId) throw new MasterClientError("invalid_result", false, 200, input.requestId);
        throw bodyError((parsed as Record<string, unknown>).error, 200, input.requestId);
      }
      if (!validResult(parsed, input.requestId)) throw new MasterClientError("invalid_result", false, 200, input.requestId);
      return parsed;
    } catch (error) {
      if (error instanceof MasterClientError) {
        throw error;
      }
      if (options.signal?.aborted) throw new MasterClientError("request_cancelled", false, null, input.requestId);
      lastError = new MasterClientError(timedOut ? "request_timeout" : "master_unavailable", true, null, input.requestId);
      if (attempt === 0) continue;
      throw lastError;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  throw lastError ?? new MasterClientError("master_unavailable", true, null, input.requestId);
}
