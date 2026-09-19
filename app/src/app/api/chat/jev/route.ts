import { NextRequest, NextResponse } from "next/server";
import { routeWithJev } from "@/lib/jev-routing";
import { MasterClientError, requestMaster } from "@/lib/master-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = { requestId: string; sessionId: string; message: string; pageContext?: { path: string; title?: string; summary?: string } };
const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUEST_KEYS = new Set(["requestId", "sessionId", "message", "pageContext"]);
const CONTEXT_KEYS = new Set(["path", "title", "summary"]);

function error(code: string, status: number, requestId: string | null, retryable = false) {
  return NextResponse.json({ error: code, code, message: code === "jev_configuration" ? "Jev is not configured." : "Jev routing is unavailable.", retryable, requestId }, { status, headers: { "cache-control": "no-store" } });
}

function parse(body: unknown): RequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) return null;
  if (typeof value.requestId !== "string" || !value.requestId || value.requestId.length > 128 || !ID_PATTERN.test(value.requestId) || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 128 || !ID_PATTERN.test(value.sessionId) || typeof value.message !== "string" || !value.message.trim() || value.message.length > 20_000) return null;
  if (value.pageContext !== undefined) {
    const context = value.pageContext;
    if (!context || typeof context !== "object" || Array.isArray(context)) return null;
    const page = context as Record<string, unknown>;
    if (Object.keys(page).some((key) => !CONTEXT_KEYS.has(key)) || typeof page.path !== "string" || !page.path || page.path.length > 256 || (page.title !== undefined && (typeof page.title !== "string" || page.title.length > 200)) || (page.summary !== undefined && (typeof page.summary !== "string" || page.summary.length > 4_000))) return null;
  }
  return value as RequestBody;
}

export async function POST(req: NextRequest) {
  if (process.env.JEV_ENABLED !== "1") return error("jev_disabled", 404, null);
  let parsed: RequestBody | null;
  try { parsed = parse(await req.json()); } catch { parsed = null; }
  if (!parsed) return error("invalid_request", 400, null);
  if (!process.env.AI_GATEWAY_API_KEY) return error("jev_configuration", 503, parsed.requestId);
  const decision = await routeWithJev({ message: parsed.message, pageContext: parsed.pageContext }, undefined, req.signal);
  if (decision.route === "ask") return NextResponse.json({ decision, answer: null, actions: [] }, { headers: { "cache-control": "no-store" } });
  try {
    const result = await requestMaster({ ...parsed, specialistId: decision.specialistId }, { signal: req.signal });
    return NextResponse.json({ decision, answer: result.answer, actions: [] }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    if (caught instanceof MasterClientError) return error(caught.code, 502, parsed.requestId, caught.retryable);
    return error("master_unavailable", 502, parsed.requestId, true);
  }
}
