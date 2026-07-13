// One VoicePal capture.
//   GET   → capture + utterances
//   POST  → an utterance: multipart {audio, role?} (whisper → persisted → Shadow
//           Reader follow-ups) OR JSON {text, role?} for typed/testing input.
//   PATCH → {action:"transform", presetId} = render the stream through a preset;
//           {action:"end"} = finish + route to the vault inbox (Hermes intake).
//
// No-loss: audio is written to disk and the utterance persisted BEFORE the
// Shadow Reader call — a crash or disconnect after that loses nothing; the
// sweep routes whatever exists.
import { NextRequest, NextResponse } from "next/server";
import {
  addUtterance,
  endCapture,
  getCapture,
  saveAudio,
  transform,
  type VoiceUtterance,
} from "@/lib/voicepal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHISPER_URL = process.env.WHISPER_URL || "http://host.docker.internal:8091";

function parseRole(v: unknown): VoiceUtterance["role"] {
  return v === "answer" || v === "prompt" ? v : "raw";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = getCapture(id);
  if (!found) return NextResponse.json({ error: "unknown capture" }, { status: 404 });
  return NextResponse.json(found);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    let text = "";
    let role: VoiceUtterance["role"] = "raw";
    let audioPath: string | undefined;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      role = parseRole(form.get("role"));
      if (!(audio instanceof Blob) || audio.size === 0) {
        return NextResponse.json({ error: "no audio received" }, { status: 400 });
      }
      const buf = Buffer.from(await audio.arrayBuffer());
      const found = getCapture(id);
      if (!found) return NextResponse.json({ error: "unknown capture" }, { status: 404 });
      // Audio hits disk first — it survives even a failed transcription.
      audioPath = saveAudio(id, found.utterances.length, buf, audio.type || "audio/webm");
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
      text = String(data.transcript || "").trim();
      if (!text) {
        return NextResponse.json(
          { error: "empty transcript — try again closer to the mic" },
          { status: 422 }
        );
      }
    } else {
      const body = await req.json();
      text = String(body.text || "").trim();
      role = parseRole(body.role);
      if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const { followUps } = await addUtterance(id, text, role, audioPath);
    return NextResponse.json({ text, followUps });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "utterance failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    if (body.action === "transform") {
      const presetId = String(body.presetId || "");
      if (!presetId) return NextResponse.json({ error: "presetId required" }, { status: 400 });
      const out = await transform(id, presetId);
      return NextResponse.json(out);
    }
    if (body.action === "end") {
      const vaultPath = await endCapture(id, false);
      return NextResponse.json({ ok: true, vaultPath });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "action failed" },
      { status: 500 }
    );
  }
}
