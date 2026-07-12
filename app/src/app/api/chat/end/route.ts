// Explicitly finish a chat conversation (panel "clear") → route it to the
// vault inbox for Hermes (T45; Samy's 2026-07-13 ruling: every finished
// session goes into the vault). Abandoned conversations that never hit this
// endpoint are swept by sweepStaleChatSessions (see /api/teach/sweep).
import { NextRequest, NextResponse } from "next/server";
import { endChatSession } from "@/lib/chat-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const vaultPath = endChatSession(sessionId, false);
    return NextResponse.json({ ok: true, vaultPath });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "end failed" },
      { status: 500 }
    );
  }
}
