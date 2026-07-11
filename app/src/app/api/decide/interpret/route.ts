// Voice ruling on one NEEDS-SAMY card: transcript in (client already ran
// /api/voice), claude maps it to a verdict + extracts the nuance as the note
// that decisions.py will write into the ROADMAP annotation.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { generateJson } from "@/lib/claude-cli";
import { DECISION_VERDICTS, type DecisionBrief, type DecisionVerdict } from "@/lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Interpretation {
  verdict: string;
  note: string;
  reply: string;
}

export async function POST(req: NextRequest) {
  let body: { id?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id || !body.transcript?.trim()) {
    return NextResponse.json({ error: "id and transcript required" }, { status: 400 });
  }
  const item = getDoc("users/local/decisionQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `item is ${item.status}, not pending` }, { status: 409 });
  }

  const brief = (item.brief ?? {}) as Partial<DecisionBrief>;
  const prompt = `Samy spoke a ruling on a decision card (a homelab task waiting on him). Map it to one verdict and carry his instructions as the note — the note gets written into the project's ROADMAP for the nightly agents, so keep every actionable nuance he gave.

The card: [${item.project}] ${item.title}
Ask: ${brief.what ?? "(no brief)"}
Implied action: ${brief.action ?? "?"}
His words (voice transcript, may have recognition errors): "${body.transcript.trim()}"

Return ONLY JSON: {"verdict": "approved|rejected|deferred|discuss", "note": "his instructions/conditions in <=2 sentences, or ''", "reply": "<=1 sentence confirming the ruling"}`;

  try {
    const out = await generateJson<Interpretation>(prompt);
    if (!DECISION_VERDICTS.includes(out.verdict as DecisionVerdict)) {
      return NextResponse.json({ error: `couldn't map "${body.transcript}" to a verdict` }, { status: 422 });
    }
    updateDoc("users/local/decisionQueue", body.id, {
      status: "decided",
      verdict: out.verdict,
      note: (out.note ?? "").slice(0, 2000),
      decidedAt: { __date: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, result: out.verdict, reply: out.reply });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "interpretation failed" },
      { status: 500 }
    );
  }
}
