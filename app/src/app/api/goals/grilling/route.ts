import { NextRequest, NextResponse } from "next/server";
import { enqueueGrillingTodo } from "@/lib/grilling";
import type { Goal } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// T27: the Todoist token lives server-side, so the client hook calls this
// route instead of POSTing to Todoist directly. Fail soft end-to-end — a
// Todoist outage never blocks the goal write; the pending reminder just
// stays pending and the enqueue can be retried.
export async function POST(req: NextRequest) {
  try {
    const goal = (await req.json()) as Partial<Goal>;
    if (!goal || typeof goal.id !== "string" || !goal.title) {
      return NextResponse.json({ error: "id and title are required" }, { status: 400 });
    }
    const result = await enqueueGrillingTodo(goal as Goal);
    return NextResponse.json(result);
  } catch (err) {
    console.error("grilling route failed", err);
    return NextResponse.json({ queued: false, error: "grilling enqueue failed" });
  }
}
