// Voice verdict on one triage card: the client transcribes speech via
// /api/voice (whisper on the host), then POSTs the transcript here; claude
// interprets it into one of the triage actions and we apply it server-side.
import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/server-db";
import { generateJson } from "@/lib/claude-cli";
import { applyActionToItem } from "@/lib/brief/triage-apply";
import { normalizeCentre, type TriageAction } from "@/lib/brief/triage-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: TriageAction[] = ["approve", "vault", "idea-bank", "backlog", "discard"];

interface Interpretation {
  action: string;
  centre?: string;
  reply: string; // one short confirmation sentence for the toast
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
  const item = getDoc("users/local/triageQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "proposed") {
    return NextResponse.json({ error: `item is ${item.status}, not proposed` }, { status: 409 });
  }

  const p = (item.proposal ?? {}) as { title?: string; summary?: string; destination?: string };
  const prompt = `Samy spoke an instruction about a saved item on his triage deck. Map it to exactly one action.

The card: "${p.title ?? p.summary ?? item.url}" (proposed destination: ${p.destination ?? "?"})
His instruction (voice transcript, may have recognition errors): "${body.transcript.trim()}"

Actions: approve (file to the proposed destination), vault (reference note), idea-bank (content idea), backlog (learning/task for a centre: lifeos|flux|ecole|scout|reels|homelab|workouts|polymath|swe), discard (drop it).
If he asks for something none of these cover, pick the closest and say so in reply.

Return ONLY JSON: {"action": "approve|vault|idea-bank|backlog|discard", "centre": "<only for backlog>", "reply": "<=1 sentence confirming what you did>"}`;

  try {
    const out = await generateJson<Interpretation>(prompt);
    if (!ACTIONS.includes(out.action as TriageAction)) {
      return NextResponse.json({ error: `couldn't map "${body.transcript}" to an action` }, { status: 422 });
    }
    const result = applyActionToItem(
      item,
      out.action as TriageAction,
      out.centre ? normalizeCentre(out.centre) : null
    );
    return NextResponse.json({ ok: true, action: out.action, result, reply: out.reply });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "interpretation failed" },
      { status: 500 }
    );
  }
}
