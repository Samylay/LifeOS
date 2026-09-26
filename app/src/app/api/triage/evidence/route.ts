import { NextRequest, NextResponse } from "next/server";
import { persistEvidence, TriageArtifactError } from "@/lib/triage-evidence";

import { advanceWaitingWorkflows } from "@/lib/workflows/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { bundle?: unknown; itemId?: unknown; expectedItemState?: unknown };
    try {
      body = (await req.json()) as { bundle?: unknown; itemId?: unknown; expectedItemState?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const bundle = body && Object.prototype.hasOwnProperty.call(body, "bundle") ? body.bundle : body;
    const result = persistEvidence(bundle, body?.itemId, body?.expectedItemState);
    if (typeof body?.itemId === "string") advanceWaitingWorkflows(body.itemId);
    return NextResponse.json({ ok: true, bundleId: result.bundleId, evidence: result });
  } catch (error) {
    const status = error instanceof TriageArtifactError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not persist evidence" }, { status });
  }
}
