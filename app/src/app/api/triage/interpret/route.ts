import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/server-db";
import { saveCalibration } from "@/lib/calibration";
import { performHomelabAction } from "@/lib/homelab-resources";
import { performAction } from "@/lib/brief/triage-apply";
import { isOpenForVerdict } from "@/lib/decide/queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string" || typeof body.transcript !== "string" || !body.transcript.trim()) throw new Error("Source and spoken answer required");
    const item = getDoc("users/local/triageQueue", body.id);
    if (!item || !isOpenForVerdict(String(item.status))) return NextResponse.json({ error: "This card is no longer open" }, { status: 409 });
    const text = body.transcript.trim();
    const command = text.toLowerCase().replace(/[.!?]/g, "").trim();
    const accept = ["yes", "yes handle it", "handle it", "that fits", "approve"].includes(command);
    const discard = ["discard", "discard it", "not for me"].includes(command);
    saveCalibration(body.id, { verdict: discard ? "not-for-me" : accept ? "fits" : "corrected", ...(accept || discard ? {} : { note: text }), evidenceRef: item.evidenceRef ?? null, assessmentRef: item.assessmentRef ?? null });
    if (accept || discard) {
      const result = discard ? performAction(item, { id: "discard", params: {} }) : performHomelabAction(item, { id: "homelab-develop", params: {} });
      return NextResponse.json({ reply: result, resolved: true });
    }
    return NextResponse.json({ reply: "Remembered. Swipe right when the intended use fits.", resolved: false });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save your answer" }, { status: 400 }); }
}
