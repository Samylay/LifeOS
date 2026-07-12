// One teaching session: GET = session + turns; POST = a learner turn
// (multipart audio → whisper → persisted turn → tutor reply, or JSON
// {transcript} for typed/testing input); PATCH {action:"end"} = end + route
// to the vault inbox (Hermes intake).
//
// No-loss: audio is written to disk and the learner turn persisted BEFORE
// the tutor model call — a crash or disconnect after that point loses
// nothing; the sweep will route what exists.
import { NextRequest, NextResponse } from "next/server";
import { endSession, getSession, learnerTurn, saveAudio } from "@/lib/teach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHISPER_URL = process.env.WHISPER_URL || "http://host.docker.internal:8091";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = getSession(id);
  if (!found) return NextResponse.json({ error: "unknown session" }, { status: 404 });
  return NextResponse.json(found);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    let transcript = "";
    let audioPath: string | undefined;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      if (!(audio instanceof Blob) || audio.size === 0) {
        return NextResponse.json({ error: "no audio received" }, { status: 400 });
      }
      const buf = Buffer.from(await audio.arrayBuffer());
      const found = getSession(id);
      if (!found) return NextResponse.json({ error: "unknown session" }, { status: 404 });
      // Audio hits disk first — it survives even a failed transcription.
      audioPath = saveAudio(id, found.turns.length, buf, audio.type || "audio/webm");
      const res = await fetch(`${WHISPER_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": audio.type || "audio/webm" },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return NextResponse.json(
          { error: `transcription failed: ${data.error || res.status}` },
          { status: 502 }
        );
      }
      transcript = String(data.transcript || "").trim();
      if (!transcript) {
        return NextResponse.json(
          { error: "empty transcript — try again closer to the mic" },
          { status: 422 }
        );
      }
    } else {
      const body = await req.json();
      transcript = String(body.transcript || "").trim();
      if (!transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 });
    }

    const reply = await learnerTurn(id, transcript, audioPath);
    return NextResponse.json({ transcript, ...reply });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "turn failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    if (body.action !== "end") return NextResponse.json({ error: "unknown action" }, { status: 400 });
    const vaultPath = await endSession(id, false);
    return NextResponse.json({ ok: true, vaultPath });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "end failed" },
      { status: 500 }
    );
  }
}
