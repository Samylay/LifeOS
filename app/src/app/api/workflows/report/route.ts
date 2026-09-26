import { NextRequest, NextResponse } from "next/server";
import { receiveReport, WorkflowError } from "@/lib/workflows/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 100000) throw new WorkflowError("Report too large", 413);
    const body = JSON.parse(text);
    if (!body || typeof body.runId !== "string") throw new WorkflowError("Run id required");
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const run = receiveReport(body.runId, token, body);
    return NextResponse.json({ ok: true, run });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record result" }, { status: error instanceof WorkflowError ? error.status : 400 }); }
}
