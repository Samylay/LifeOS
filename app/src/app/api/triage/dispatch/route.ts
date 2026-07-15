// Merge every queued prompt into one brief and hand it to the homelab: the
// merged prompt is written to users/local/promptDispatch (status "pending"),
// where the host-side poller (~/services/triage/dispatch-claude.py) picks it
// up and launches a remote-controlled Claude Code session with it. The
// container can't reach tmux/claude on the host, so the doc IS the handoff.
// Core logic lives in lib/homelab-tools.ts. This route is now the ONLY caller
// of dispatchQueuedPrompts: per T47 (Samy 2026-07-14) the chat Assistant may
// queue but never launch, so starting a session stays a deliberate /decide-UI
// action rather than something one phone message can trigger.
import { NextResponse } from "next/server";
import { dispatchQueuedPrompts } from "@/lib/homelab-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const r = dispatchQueuedPrompts();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({
    ok: true,
    dispatchId: r.dispatchId,
    dispatchIds: r.dispatchIds,
    batchCount: r.batchCount,
    itemCount: r.itemCount,
  });
}
