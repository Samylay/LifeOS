// Undo one NEEDS-SAMY ruling: flip a decided item back to pending. Only works
// before the host-side nightly `decisions.py apply` writes it into the
// ROADMAP (status "applied" is durable — undoing that means editing the
// ROADMAP, which stays a human/git operation).
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
  const item = getDoc("users/local/decisionQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "decided") {
    return NextResponse.json(
      { error: `item is ${item.status} — only un-applied verdicts can be undone` },
      { status: 409 }
    );
  }
  updateDoc("users/local/decisionQueue", body.id, {
    status: "pending",
    verdict: null,
    note: null,
    decidedAt: null,
    restoredAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true });
}
