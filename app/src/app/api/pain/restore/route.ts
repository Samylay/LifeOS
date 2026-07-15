// Undo one pain verdict (the deck's Undo toast).
//
// A drop has no side effects, so undoing it is just putting the card back. A
// keep filed a lead, so undoing it removes that lead — under the same two
// guards the bookmark shelf uses: only delete a row we created (not one that
// already existed), and only while it is still "new". Once Samy has moved it
// to contacted/won/passed the lead has a life of its own and stays.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc, deleteDoc } from "@/lib/server-db";
import { LEADS_COLLECTION } from "@/lib/leads-ingest";
import { PAIN_COLLECTION } from "@/lib/pain-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = getDoc(PAIN_COLLECTION, body.id) as
    | { status: string; leadId?: string; wasDuplicate?: boolean }
    | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "kept" && item.status !== "dropped") {
    return NextResponse.json({ error: `item is ${item.status}, nothing to undo` }, { status: 409 });
  }

  if (item.status === "kept" && item.leadId && !item.wasDuplicate) {
    const lead = getDoc(LEADS_COLLECTION, item.leadId) as { status?: string } | null;
    if (lead?.status === "new") deleteDoc(LEADS_COLLECTION, item.leadId);
  }

  updateDoc(PAIN_COLLECTION, body.id, {
    status: "pending",
    decidedAt: null,
    leadId: null,
    wasDuplicate: null,
  });
  return NextResponse.json({ ok: true });
}
