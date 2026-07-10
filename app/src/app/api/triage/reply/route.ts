// T36 — triage verdict transport. POST { text } parses numbered verdicts
// against today's proposed items (same createdAt-asc order the Triage card
// numbers by) and files each: vault note / idea-bank doc / learning-backlog
// append / discard. Execution lives in lib/brief/triage-apply.ts (shared with
// the voice inbox); parsing in lib/brief/triage-reply.ts — both transport-free.
import { NextRequest, NextResponse } from "next/server";
import { applyTriageReply } from "@/lib/brief/triage-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let text: string;
  let source: string | undefined;
  try {
    const body = (await req.json()) as { text?: string; source?: string };
    text = String(body.text ?? "").trim();
    source = body.source ? String(body.source) : undefined;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ ok: false, error: "empty text" }, { status: 400 });

  const result = applyTriageReply(text, source);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
