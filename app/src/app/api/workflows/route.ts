import { NextRequest, NextResponse } from "next/server";
import { getDoc, listDocs } from "@/lib/server-db";
import { getRun, listRuns, sourceChoices, startWorkflow, decideWorkflow, WorkflowError, LIBRARY } from "@/lib/workflows/store";
import { isWorkflowKind } from "@/lib/workflows/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const run = getRun(id);
      const evidence = run.evidenceRef ? getDoc("users/local/triageEvidence", run.evidenceRef) : null;
      return NextResponse.json({ run, evidence });
    }
    if (req.nextUrl.searchParams.has("summary")) { const runs = listRuns(); return NextResponse.json({ ready: runs.filter((r) => r.state === "ready").length, active: runs.filter((r) => ["queued", "running", "applying", "awaiting-extraction"].includes(r.state)).length }); }
    if (req.nextUrl.searchParams.has("library")) return NextResponse.json({ items: listDocs(LIBRARY, { orderBy: ["createdAt", "desc"] }) });
    return NextResponse.json({ runs: listRuns(), sources: sourceChoices() });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "start") {
      if (typeof body.itemId !== "string" || !isWorkflowKind(body.kind)) throw new WorkflowError("Item and workflow required");
      return NextResponse.json({ run: startWorkflow(body.itemId, body.kind) });
    }
    if (typeof body.id !== "string") throw new WorkflowError("Run id required");
    return NextResponse.json({ run: decideWorkflow(body.id, body.action, body.reportHash) });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow request failed" }, { status: error instanceof WorkflowError ? error.status : 400 }); }
