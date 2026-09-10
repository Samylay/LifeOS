import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { BLOCKS, SKILLS, emptyRound, profile, recommend, type Material, type Turn, type Language, type Block } from "@/lib/fluency/model";
import * as store from "@/lib/fluency/store";
import { reviewSession } from "@/lib/fluency/review";
import { connectionInfo, voiceSession } from "@/lib/fluency/provider";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;

const string = (v: unknown, max = 10000) => { if (typeof v !== "string" || v.length > max) throw new Error("Invalid text."); return v; };
const member = <T extends string>(v: unknown, values: readonly T[]): T => { if (!values.includes(v as T)) throw new Error("Invalid choice."); return v as T; };
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new Error("Request origin not allowed.");
}
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) return NextResponse.json({ session: store.session(id) });
    const sessions = store.sessions(), preferences = store.preferences(), materials = store.materials();
    return NextResponse.json({ preferences, materials, phrases: store.phrases(), ...connectionInfo(), profile: profile(sessions, preferences.language), recommendations: Object.fromEntries(Object.keys(BLOCKS).map(b => [b, recommend(materials, sessions, preferences, b as Block)])), sessions: sessions.slice(0, 30).map(s => ({ id: s.id, title: s.material.title, createdAt: s.createdAt, status: s.status, language: s.material.language, rounds: s.rounds.length })) });
  } catch { return NextResponse.json({ error: "Could not load fluency practice." }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const body = await req.json();
    if (body.action === "phrase") {
      const text = string(body.text, 1500).trim();
      if (!text) throw new Error("Add a phrase or cue worth practising.");
      const source = body.sessionId ? store.session(string(body.sessionId, 100)) : null;
      const original = body.original ? string(body.original, 1500) : "";
      if (original && !source?.rounds.some(r => r.turns.some(t => t.role === "user" && t.text.includes(original)))) throw new Error("The original phrase was not found in that session.");
      store.savePhrase({ id: body.phraseId ? string(body.phraseId, 100) : randomUUID(), text, language: member(body.language, ["en", "fr"]), ...(source ? { sessionId: source.id, original } : {}) });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "preferences") {
      const old = store.preferences();
      const next = { ...old, language: member(body.language ?? old.language, ["en", "fr"] as Language[]), preparation: body.preparation ?? old.preparation, feedback: member(body.feedback ?? old.feedback, ["gentle", "direct"] as const), focus: member(body.focus ?? old.focus, ["auto", ...Object.keys(SKILLS)]), dismissed: old.dismissed };
      if (![0, 20, 60].includes(next.preparation)) throw new Error("Invalid preparation time.");
      if (body.dismiss) next.dismissed = [...new Set([...old.dismissed, `${next.language}:${member(body.dismiss, Object.keys(SKILLS))}`])];
      if (body.restore) next.dismissed = old.dismissed.filter(x => x !== `${next.language}:${member(body.restore, Object.keys(SKILLS))}`);
      store.savePreferences(next as ReturnType<typeof store.preferences>);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "material") {
      const m: Material = { id: body.id ? string(body.id, 100) : randomUUID(), title: string(body.title, 120).trim(), language: member(body.language, ["en", "fr"]), block: member(body.block, Object.keys(BLOCKS) as Block[]), skill: member(body.skill, Object.keys(SKILLS) as (keyof typeof SKILLS)[]), prompt: string(body.prompt, 3000).trim(), hint: string(body.hint, 1500), example: string(body.example, 3000), variation: string(body.variation, 3000).trim(), passage: string(body.passage ?? "", 5000), archived: body.archived === true };
      if (!m.title || !m.prompt || !m.variation) throw new Error("Add a title, prompt, and fresh prompt.");
      store.saveMaterial(m); return NextResponse.json({ material: m });
    }
    if (body.action === "create") {
      const material = store.materials().find(m => m.id === body.materialId && !m.archived);
      if (!material) throw new Error("Choose an available exercise.");
      return NextResponse.json({ session: store.createSession(material) });
    }
    const s = store.session(string(body.id, 100)), phase = body.phase ?? s.phase;
    if (!Number.isInteger(phase) || !s.rounds[phase]) throw new Error("Practice round not found.");
    const round = s.rounds[phase];
    if (body.action === "correct") {
      const t = round.turns.find(t => t.id === body.turnId && t.role === "user");
      if (!t) throw new Error("Attempt not found.");
      if (body.version !== t.version) throw new Error("This transcript has changed. Reload it before editing.");
      return NextResponse.json({ session: store.changeTurn(s, phase, { ...t, text: string(body.text), disputed: body.disputed === true, version: t.version + 1 }) });
    }
    if (body.action === "review") return NextResponse.json({ session: await reviewSession(s, phase) });
    if (s.status !== "active" || phase !== s.phase) throw new Error("This round has ended.");
    if (body.action === "turn") {
      const id = string(body.turnId, 150);
      if (round.turns.some(t => t.id === id)) return NextResponse.json({ session: s });
      if (round.turns.length >= 100 || round.turns.reduce((n, t) => n + t.text.length, 0) > 40000) throw new Error("Finish this attempt before adding more speech.");
      const text = string(body.text).trim();
      if (!text) throw new Error("The transcript is empty.");
      const turn: Turn = { id, text, original: text, version: 1, disputed: false, role: member(body.role ?? "user", ["user", "agent"]), source: member(body.source ?? "typed", ["live", "typed"]) };
      return NextResponse.json({ session: store.changeTurn(s, phase, turn) });
    }
    if (body.action === "hint") { round.hints++; store.saveSession(s); }
    else if (body.action === "voice") return NextResponse.json(await voiceSession(s));
    else if (body.action === "advance") {
      if (!round.review || round.review.revision !== round.revision) throw new Error("Review this attempt first.");
      if (s.phase >= 2) s.status = "complete";
      else { s.phase++; s.rounds.push(emptyRound(s.phase === 1 ? s.material.prompt : s.material.variation)); }
      store.saveSession(s);
    } else if (body.action === "finish") { s.status = "complete"; store.saveSession(s); }
    else throw new Error("Unknown practice action.");
    return NextResponse.json({ session: s });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Practice could not be saved." }, { status: 400 }); }
}
