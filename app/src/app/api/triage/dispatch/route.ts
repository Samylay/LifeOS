// Merge every queued prompt into one brief and hand it to the homelab: the
// merged prompt is written to users/local/promptDispatch (status "pending"),
// where the host-side poller (~/services/triage/dispatch-claude.py) picks it
// up and launches a remote-controlled Claude Code session with it. The
// container can't reach tmux/claude on the host, so the doc IS the handoff.
import { NextResponse } from "next/server";
import { listDocs, createDoc, updateDoc } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUEUE = "users/local/promptQueue";
const DISPATCH = "users/local/promptDispatch";

export async function POST() {
  const queued = listDocs(QUEUE, {
    where: [["status", "==", "queued"]],
    orderBy: ["queuedAt", "asc"],
  }) as { id: string; title?: string; prompt?: string }[];

  if (queued.length === 0) {
    return NextResponse.json({ error: "prompt queue is empty" }, { status: 409 });
  }

  const header =
    `${queued.length} approved item(s) from the LifeOS /decide deck need acting on. ` +
    "Work through them one at a time; verify each before moving on. " +
    "If one is blocked, note why and continue with the rest. Report per-item outcomes at the end.";
  const merged = [
    header,
    ...queued.map((q, i) => `## Item ${i + 1}: ${q.title || "untitled"}\n\n${q.prompt ?? ""}`),
  ].join("\n\n");

  const dispatchId = createDoc(DISPATCH, {
    prompt: merged,
    itemCount: queued.length,
    titles: queued.map((q) => q.title ?? ""),
    status: "pending",
    createdAt: { __date: new Date().toISOString() },
  });
  for (const q of queued) {
    updateDoc(QUEUE, q.id, { status: "dispatched", dispatchId });
  }
  return NextResponse.json({ ok: true, dispatchId, itemCount: queued.length });
}
