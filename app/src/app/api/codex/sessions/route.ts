import { NextRequest, NextResponse } from "next/server";
import { getCodexSessions } from "@/lib/codex-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ sessions: await getCodexSessions(req.nextUrl.searchParams.get("id") || undefined) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read Codex sessions" }, { status: 502 });
  }
}
