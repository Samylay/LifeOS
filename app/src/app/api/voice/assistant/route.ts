import { NextRequest, NextResponse } from "next/server";
import { assistantVoiceAvailable, createAssistantVoiceToken } from "@/lib/voice/assistant-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ available: assistantVoiceAvailable() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
    }
    const token = await createAssistantVoiceToken();
    return NextResponse.json({ token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Voice connection failed." }, { status: 503 });
  }
}
