// Merge every queued prompt into one brief and hand it to the homelab: the
// merged prompt is written to users/local/promptDispatch (status "pending"),
// where the host-side poller picks it
// up and launches a Codex session with it. The container can't reach the
// host process directly, so the doc IS the handoff.
// Core logic lives in lib/homelab-tools.ts. This remains the /decide queue path.
// Explicit chat start requests launch directly through the host sessions API. An optional {promptId} body dispatches exactly one queued
// prompt after the user confirms it in the UI.
import { NextRequest, NextResponse } from "next/server";
import { dispatchQueuedPrompts } from "@/lib/homelab-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const promptId = typeof body?.promptId === "string" && body.promptId ? body.promptId : undefined;
  const r = dispatchQueuedPrompts(promptId ? { promptId } : undefined);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({
    ok: true,
    dispatchId: r.dispatchId,
    dispatchIds: r.dispatchIds,
    batchCount: r.batchCount,
    itemCount: r.itemCount,
  });
}
