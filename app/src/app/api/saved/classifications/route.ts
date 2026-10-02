import { NextRequest, NextResponse } from "next/server";
import { publishSavedClassification } from "@/lib/saved-library";
import { TriageArtifactError } from "@/lib/triage-evidence";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.acceptReference !== undefined && typeof body.acceptReference !== "boolean") return NextResponse.json({ error: "acceptReference must be boolean" }, { status: 400 });
    return NextResponse.json({ ok: true, ...publishSavedClassification(body.record, body.expectedItemState, body.acceptReference === true) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid classification" }, { status: error instanceof TriageArtifactError ? error.status : error instanceof SyntaxError ? 400 : 500 });
  }
}
