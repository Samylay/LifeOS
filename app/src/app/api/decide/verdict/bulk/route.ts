// Record one verdict across many NEEDS-SAMY cards in a single call — the
// server side of the /decide "Apply to all" bulk action. Same semantics as the
// single-card verdict route (flip pending items to "decided"; the durable
// ROADMAP write-back + execution still happen host-side in decisions.py), just
// vectorised. The id list is capped so an oversized deck can't land as one
// giant payload — the client chunks it into several calls (413 if it doesn't).
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { DECISION_VERDICTS, type DecisionVerdict } from "@/lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ceiling per request. The client batches into chunks below this; a caller that
// ignores the batching contract gets a clear 413 rather than a silent partial.
const MAX_IDS_PER_CALL = 50;

export async function POST(req: NextRequest) {
  let body: { ids?: unknown; verdict?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (!DECISION_VERDICTS.includes(body.verdict as DecisionVerdict)) {
    return NextResponse.json({ error: "a valid verdict is required" }, { status: 400 });
  }
  if (body.ids.length > MAX_IDS_PER_CALL) {
    return NextResponse.json(
      { error: `too many ids (${body.ids.length} > ${MAX_IDS_PER_CALL}) — batch into smaller calls`, maxPerCall: MAX_IDS_PER_CALL },
      { status: 413 }
    );
  }

  const ids = [...new Set(body.ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const note = (body.note ?? "").slice(0, 2000);
  const decidedAt = { __date: new Date().toISOString() };

  const applied: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const item = getDoc("users/local/decisionQueue", id);
    if (!item) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (item.status !== "pending") {
      skipped.push({ id, reason: `already ${item.status}` });
      continue;
    }
    updateDoc("users/local/decisionQueue", id, {
      status: "decided",
      verdict: body.verdict,
      note,
      decidedAt,
    });
    applied.push(id);
  }

  return NextResponse.json({ ok: true, verdict: body.verdict, applied, skipped });
}
