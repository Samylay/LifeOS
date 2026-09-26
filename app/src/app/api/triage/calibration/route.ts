import { listRuns, startWorkflow, decideWorkflow } from "@/lib/workflows/store";
import { NextRequest, NextResponse } from "next/server";
import { calibrationContext, calibrationSummary, ensureCalibrationReminder, saveCalibration } from "@/lib/calibration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("itemId");
  return NextResponse.json(id ? { context: calibrationContext(id) } : calibrationSummary());
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "reminder") return NextResponse.json({ reminder: await ensureCalibrationReminder() });
    if (typeof body.itemId !== "string") throw new Error("Source required");
    const active = listRuns().filter(run => run.itemId === body.itemId && run.phase === "evaluate" && ["awaiting-extraction", "queued", "running", "ready"].includes(run.state));
    const feedback = saveCalibration(body.itemId, body);
    if (active.length && body.verdict !== "not-for-me") {
      for (const run of active.filter(run => ["awaiting-extraction", "queued"].includes(run.state))) {
        try { decideWorkflow(run.id, "dismiss", undefined); } catch { /* Claimed work cannot be cancelled here; its old intent cannot be applied. */ }
      }
      const run = startWorkflow(body.itemId);
      return NextResponse.json({ feedback, run });
    }
    return NextResponse.json({ feedback });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save your answer" }, { status: 400 }); }
}
