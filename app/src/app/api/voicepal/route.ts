// VoicePal capture surface: GET = captures + presets; POST = start a capture.
// Per-capture actions (utterances, transform, end) live at /api/voicepal/[id];
// preset CRUD at /api/voicepal/presets.
import { NextRequest, NextResponse } from "next/server";
import { listCaptures, listPresets, startCapture } from "@/lib/voicepal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ captures: listCaptures(), presets: listPresets() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action && body.action !== "start") {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    const id = startCapture();
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "start failed" },
      { status: 500 }
    );
  }
}
