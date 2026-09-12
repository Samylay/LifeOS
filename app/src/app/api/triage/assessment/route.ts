import { NextRequest, NextResponse } from "next/server";
import { publishAssessment, TriageArtifactError } from "@/lib/triage-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { assessment?: unknown; expectedPriorAssessmentId?: unknown; expectedAssessmentId?: unknown };
    try {
      body = (await req.json()) as { assessment?: unknown; expectedPriorAssessmentId?: unknown; expectedAssessmentId?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const assessment = body && Object.prototype.hasOwnProperty.call(body, "assessment") ? body.assessment : body;
    const result = publishAssessment(assessment, body?.expectedPriorAssessmentId ?? body?.expectedAssessmentId);
    return NextResponse.json({ ok: true, assessmentId: result.assessmentId, assessment: result });
  } catch (error) {
    const status = error instanceof TriageArtifactError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not persist assessment" }, { status });
  }
}
