import { NextRequest, NextResponse } from "next/server";
import { rerouteCapture, retryTranscription } from "@/lib/voice-reroute";
import { discardPending, getPendingCapture } from "@/lib/voice-stash";
import type { VoiceDestination } from "@/lib/voice-routing";

// T-voice-rework-05 — the one-tap exit for any entry in the recent list:
// PATCH {action:"reroute", destination} moves a landed capture to a
// different destination; PATCH {action:"retry-transcription"} re-runs
// whisper against the audio already on disk for a take that failed to
// transcribe; DELETE discards a take without ever deleting its row or audio
// (voice-stash.ts's discardPending — "discarded" means "resolved," not
// "gone," so this can never be the thing that loses a spoken thought).
export const dynamic = "force-dynamic";

const DESTINATIONS: readonly VoiceDestination[] = ["vault", "todoist", "idea-bank", "decide"];

function isVoiceDestination(v: unknown): v is VoiceDestination {
  return typeof v === "string" && (DESTINATIONS as readonly string[]).includes(v);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();

    if (body.action === "reroute") {
      if (!isVoiceDestination(body.destination)) {
        return NextResponse.json({ error: "unknown destination" }, { status: 400 });
      }
      const result = await rerouteCapture(id, body.destination);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ ok: true, destination: result.destination });
    }

    if (body.action === "retry-transcription") {
      const result = await retryTranscription(id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ ok: true, transcript: result.transcript });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "request failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getPendingCapture(id)) {
    return NextResponse.json({ error: "capture not found" }, { status: 404 });
  }
  discardPending(id);
  return NextResponse.json({ ok: true });
}
