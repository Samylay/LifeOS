// Undo one pain verdict (the deck's Undo toast).
//
// Trivially reversible: a verdict here has no side effects — nothing is
// enqueued, fetched, or deleted — so restoring is just putting the card back
// on the stack.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
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

  const item = getDoc(PAIN_COLLECTION, body.id) as { status: string } | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "kept" && item.status !== "dropped") {
    return NextResponse.json({ error: `item is ${item.status}, nothing to undo` }, { status: 409 });
  }

  updateDoc(PAIN_COLLECTION, body.id, { status: "pending", decidedAt: null });
  return NextResponse.json({ ok: true });
}
