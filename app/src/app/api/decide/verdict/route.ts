// Record Samy's ruling on one NEEDS-SAMY card. This only flips the DB item to
// "decided" — the durable ROADMAP annotation + commit happens host-side in
// decisions.py `apply` (the container's ~/apps//~/infra mounts are read-only).
// Execution of the approved action itself always goes through the normal
// pipeline; recording the decision is the deliverable here.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { DECISION_VERDICTS, type DecisionVerdict } from "@/lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { id?: string; verdict?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id || !DECISION_VERDICTS.includes(body.verdict as DecisionVerdict)) {
    return NextResponse.json({ error: "id and a valid verdict required" }, { status: 400 });
  }
  const item = getDoc("users/local/decisionQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `item is ${item.status}, not pending` }, { status: 409 });
  }
  updateDoc("users/local/decisionQueue", body.id, {
    status: "decided",
    verdict: body.verdict,
    note: (body.note ?? "").slice(0, 2000),
    decidedAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true, result: body.verdict });
}
