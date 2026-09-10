import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { session, changeTurn } from "@/lib/fluency/store";
import { transcribeAudio } from "@/lib/voice-transcribe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const dir = () => path.join(path.dirname(process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data/lifeos.db")), "fluency-audio");
const audioPath = (id: string) => path.join(dir(), `${id}.audio`);

export async function GET(req: NextRequest, ctx: Context) {
  try {
    const s = session((await ctx.params).id);
    const turn = s.rounds.flatMap(r => r.turns).find(t => t.id === req.nextUrl.searchParams.get("turn") && t.audio);
    if (!turn) return new NextResponse(null, { status: 404 });
    const stored = JSON.parse(fs.readFileSync(`${audioPath(turn.id)}.json`, "utf8"));
    return new NextResponse(fs.readFileSync(audioPath(turn.id)), { headers: { "Content-Type": stored.mime, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new Error("Request origin not allowed.");
    const id = (await ctx.params).id, s = session(id), phase = s.phase;
    if (s.status !== "active") throw new Error("This session has ended.");
    const form = await req.formData(), retry = form.get("retry");
    let turn = retry ? s.rounds[phase].turns.find(t => t.id === retry && t.audio && !t.text) : undefined;
    let buf: Buffer, mime: string;
    if (retry) {
      if (!turn) throw new Error("Recording not found or already transcribed.");
      buf = fs.readFileSync(audioPath(turn.id)); mime = JSON.parse(fs.readFileSync(`${audioPath(turn.id)}.json`, "utf8")).mime;
    } else {
      const audio = form.get("audio");
      if (!(audio instanceof Blob) || !audio.size || audio.size > 25 * 1024 * 1024) throw new Error("Record an attempt under 25 MB.");
      if (s.rounds[phase].turns.length >= 100) throw new Error("Finish this attempt before recording more.");
      mime = audio.type || "audio/webm";
      if (!/^audio\/(webm|ogg|mp4|mpeg|wav)(;.*)?$/.test(mime)) throw new Error("Unsupported audio format.");
      buf = Buffer.from(await audio.arrayBuffer());
      turn = { id: randomUUID(), role: "user", source: "recorded", text: "", original: "", version: 1, disputed: false, audio: true, error: "Transcription pending. Retry if interrupted." };
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(audioPath(turn.id), buf, { mode: 0o600 });
      fs.writeFileSync(`${audioPath(turn.id)}.json`, JSON.stringify({ mime }), { mode: 0o600 });
      changeTurn(s, phase, turn);
    }
    const savedTurn = turn!;
    const result = await transcribeAudio(buf, mime);
    const latest = session(id), current = latest.rounds[phase].turns.find(t => t.id === savedTurn.id)!;
    if (current.version !== savedTurn.version || current.text) return NextResponse.json({ session: latest });
    const text = result.ok ? result.transcript!.slice(0, 10000) : "";
    changeTurn(latest, phase, { ...current, text, original: text, version: current.version + 1, error: result.ok ? undefined : "Transcription failed. Your recording is saved; retry or correct the transcript." });
    return NextResponse.json({ session: latest });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Recording failed." }, { status: 400 }); }
}
