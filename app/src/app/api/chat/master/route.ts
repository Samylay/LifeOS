import { NextRequest, NextResponse } from "next/server";
import { MasterClientError, requestMaster, type MasterResultV1 } from "@/lib/master-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_LENGTH = 20_000;
const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUEST_KEYS = new Set(["requestId", "sessionId", "message", "pageContext"]);
const CONTEXT_KEYS = new Set(["path", "title", "summary"]);

type BrowserContext = { path: string; title?: string; summary?: string };
type BrowserRequest = {
  requestId: string;
  sessionId: string;
  message: string;
  pageContext?: BrowserContext;
};

function errorBody(
  requestId: string | null,
  code: string,
  message: string,
  retryable: boolean,
  status: number
) {
  return { error: code, code, message, retryable, status, requestId };
}

function fail(requestId: string | null, code: string, message: string, status: number, retryable = false) {
  return NextResponse.json(errorBody(requestId, code, message, retryable, status), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>) {
  return Object.keys(value).every((key) => keys.has(key));
}

async function readJson(req: NextRequest): Promise<unknown> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) {
      throw new Error("body_too_large");
    }
  }

  if (!req.body) {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
    return JSON.parse(text);
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function parseRequest(body: unknown): BrowserRequest | { error: string } {
  if (!isRecord(body) || !hasOnlyKeys(body, REQUEST_KEYS)) return { error: "invalid_request" };
  const { requestId, sessionId, message, pageContext } = body;
  if (
    typeof requestId !== "string" ||
    requestId.length < 1 ||
    requestId.length > 128 ||
    !ID_PATTERN.test(requestId) ||
    typeof sessionId !== "string" ||
    sessionId.length < 1 ||
    sessionId.length > 128 ||
    !ID_PATTERN.test(sessionId) ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) return { error: "invalid_request" };

  if (pageContext !== undefined) {
    if (!isRecord(pageContext) || !hasOnlyKeys(pageContext, CONTEXT_KEYS)) return { error: "invalid_page_context" };
    if (
      typeof pageContext.path !== "string" ||
      pageContext.path.length < 1 ||
      pageContext.path.length > 256 ||
      (pageContext.title !== undefined && (typeof pageContext.title !== "string" || pageContext.title.length > 200)) ||
      (pageContext.summary !== undefined && (typeof pageContext.summary !== "string" || pageContext.summary.length > 4000))
    ) return { error: "invalid_page_context" };
  }
  return { requestId, sessionId, message, pageContext: pageContext as BrowserContext | undefined };
}

function projectResult(result: MasterResultV1, requestId: string) {
  const raw = result as Omit<MasterResultV1, "status"> & { status: string; actions?: unknown[] };
  if (raw.status === "failed") {
    return fail(requestId, "master_failed", "The assistant could not complete the request.", 502, true);
  }
  if (raw.status === "needs_action" || (Array.isArray(raw.actions) && raw.actions.length > 0)) {
    return fail(requestId, "unsafe_result", "The assistant returned an unsupported action.", 502);
  }
  if (raw.request_id !== requestId || (raw.status !== "completed" && raw.status !== "partial")) {
    return fail(requestId, "invalid_result", "The assistant returned an invalid result.", 502);
  }
  return NextResponse.json({
    api_version: result.api_version,
    request_id: requestId,
    status: result.status,
    answer: result.answer,
    structured_data: result.structured_data ?? {},
    actions: [],
    delegation_trace: result.delegation_trace ?? [],
    citations: result.citations ?? [],
    confidence: result.confidence ?? null,
    escalation: result.escalation ?? null,
    job_id: null,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (process.env.LIFEOS_MASTER_ENABLED !== "1") return fail(null, "master_disabled", "Master assistant is disabled.", 404);

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body_too_large";
    return fail(null, tooLarge ? "body_too_large" : "invalid_json", "Invalid request body.", tooLarge ? 413 : 400);
  }
  const parsed = parseRequest(body);
  if ("error" in parsed) return fail(null, parsed.error, "Invalid request.", 400);

  try {
    const result = await requestMaster(
      {
        requestId: parsed.requestId,
        sessionId: parsed.sessionId,
        message: parsed.message,
        ...(parsed.pageContext ? { pageContext: parsed.pageContext } : {}),
      },
      { signal: req.signal }
    );
    return projectResult(result, parsed.requestId);
  } catch (error) {
    if (error instanceof MasterClientError) {
      const status = error.status !== null && error.status >= 400 && error.status <= 599 ? error.status : 502;
      return fail(parsed.requestId, error.code, error.message, status, error.retryable);
    }
    return fail(parsed.requestId, "master_unavailable", "The assistant is temporarily unavailable.", 502, true);
  }
}
