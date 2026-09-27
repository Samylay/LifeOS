import { NextResponse } from "next/server";
import { StudioError } from "./service";

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new StudioError("Send application/json.", 415);
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string;
    try { host = new URL(origin).host; } catch { throw new StudioError("Invalid request origin.", 403); }
    if (host !== (req.headers.get("host") || new URL(req.url).host)) throw new StudioError("Use the LifeOS studio to send this request.", 403);
  }
  if (!req.body) throw new StudioError("Supply a request body.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 64000) { await reader.cancel(); throw new StudioError("Brief is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new StudioError("Invalid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new StudioError("Supply an object.");
  return parsed as Record<string, unknown>;
}
export function failure(error: unknown) {
  const status = error instanceof StudioError ? error.status : error instanceof Error && /Check |Choose |Supply |feature|Feature|Keep /.test(error.message) ? 400 : 502;
  return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "The studio could not complete this request. Try again." }, { status });
}
