// Prompt queue for the Approved view: each approved triage item can queue one
// prompt describing the action to take on it (install the skill, try the
// technique, …). Queued prompts are merged by /api/triage/dispatch into one
// brief for a Claude Code session on the homelab host.
import { NextRequest, NextResponse } from "next/server";
import { listDocs, createDoc, deleteDoc } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "users/local/promptQueue";

export async function GET() {
  const items = listDocs(COLLECTION, {
    where: [["status", "==", "queued"]],
    orderBy: ["queuedAt", "asc"],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  let body: { itemId?: string; title?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.itemId || !body.prompt) {
    return NextResponse.json({ error: "itemId and prompt required" }, { status: 400 });
  }
  const dupe = listDocs(COLLECTION, {
    where: [["itemId", "==", body.itemId], ["status", "==", "queued"]],
  });
  if (dupe.length > 0) {
    return NextResponse.json({ ok: true, id: dupe[0].id, result: "already queued" });
  }
  const id = createDoc(COLLECTION, {
    itemId: body.itemId,
    title: (body.title ?? "").slice(0, 160),
    prompt: body.prompt,
    status: "queued",
    queuedAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true, id, result: "queued" });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteDoc(COLLECTION, id);
  return NextResponse.json({ ok: true });
}
