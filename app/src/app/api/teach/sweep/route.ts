// Abandonment sweep + due-session feed.
// POST: force-end stale live sessions and retry unrouted ones → Hermes.
//   Called by the nightly grabbers cron and manually. Chat conversations
//   (T45) ride the same sweep so the existing cron caller needs no change.
//   GET: topics scheduled for today or earlier — consumed by the morning
//   attention push.
import { NextResponse } from "next/server";
import { dueTopics, sweepStaleSessions } from "@/lib/teach";
import { sweepStaleChatSessions } from "@/lib/chat-log";
import { sweepStaleCaptures } from "@/lib/voicepal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sweepStaleSessions();
    const chat = sweepStaleChatSessions();
    // VoicePal captures (standalone capture surface) ride the same sweep so an
    // abandoned capture still reaches the vault — no new cron caller needed.
    const voicepal = await sweepStaleCaptures();
    return NextResponse.json({ ...result, chat, voicepal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({ due: dueTopics(today) });
}
