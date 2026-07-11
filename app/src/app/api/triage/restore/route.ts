// Undo one /decide verdict: put a filed/discarded triage item back in the
// proposed pool. Filing side effects (a vault entry, an idea-bank doc, a
// backlog line) are NOT reverted — restoring only re-opens the decision;
// duplicate artifacts from a rare vault-then-undo are cheap and visible.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";

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
  const item = getDoc("users/local/triageQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "filed" && item.status !== "discarded") {
    return NextResponse.json({ error: `item is ${item.status}, nothing to undo` }, { status: 409 });
  }
  updateDoc("users/local/triageQueue", body.id, {
    status: "proposed",
    filedAs: null,
    filedAt: null,
    restoredAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true });
}
