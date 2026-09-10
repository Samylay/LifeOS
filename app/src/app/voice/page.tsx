"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Mic, Settings2, Square, RotateCcw, Volume2 } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BLOCKS, SKILLS, type Block, type Session, type Turn } from "@/lib/fluency/model";
import { loadSession, request, type Dashboard } from "@/lib/fluency/client";
import { useLive } from "@/lib/fluency/use-live";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";

const panel = "rounded-2xl border border-border bg-card p-5 sm:p-7";
const stages = ["First attempt", "Try it again", "A fresh prompt"];

function Transcript({ turn, id, phase, editable, onSaved, onError }: { turn: Turn; id: string; phase: number; editable: boolean; onSaved: (s: Session) => void; onError: (s: string) => void }) {
  const [editing, setEditing] = useState(false), [text, setText] = useState(turn.text), [saving, setSaving] = useState(false);
  const save = async (disputed: boolean) => {
    setSaving(true);
    try { const r = await request<{ session: Session }>({ action: "correct", id, phase, turnId: turn.id, version: turn.version, text: editing ? text : turn.text, disputed }); onSaved(r.session); setEditing(false); }
    catch (e) { onError((e as Error).message); } finally { setSaving(false); }
  };
  return <div className={`rounded-xl border p-4 ${turn.disputed ? "border-dashed border-border opacity-70" : "border-border"}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{turn.role === "user" ? "You" : "Coach"}{turn.source === "typed" ? " · typed practice" : ""}{turn.disputed ? " · excluded from feedback" : ""}</span>
      {turn.role === "user" && editable && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={saving} onClick={() => { setText(turn.text); setEditing(!editing); }}>Correct transcript</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void save(!turn.disputed)}>{turn.disputed ? "Include again" : "That’s not what I said"}</Button></div>}</div>
    {editing ? <div className="space-y-2"><Textarea aria-label="Corrected transcript" value={text} onChange={e => setText(e.target.value)} /><Button disabled={saving} onClick={() => void save(false)}>Save correction</Button><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{turn.text || turn.error || "Waiting for transcription"}</p>}
    {turn.version > 1 && turn.original && turn.original !== turn.text && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Original transcript</summary><p className="mt-2 whitespace-pre-wrap">{turn.original}</p></details>}
    {turn.audio && <audio className="mt-3 w-full" controls preload="none" src={`/api/fluency/${id}/audio?turn=${encodeURIComponent(turn.id)}`} />}
  </div>;
}

function Practice({ initial, connected, onBack }: { initial: Session; connected: boolean; onBack: () => void }) {
  const [s, setS] = useState(initial), [error, setError] = useState(""), [busy, setBusy] = useState(false), [typed, setTyped] = useState("");
  const [cueSaved, setCueSaved] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true), [showPassage, setShowPassage] = useState(true), [showHint, setShowHint] = useState(false), [viewPhase, setViewPhase] = useState(initial.phase);
  const [seconds, setSeconds] = useState(initial.preferences.preparation), [preparing, setPreparing] = useState(false);
  const live = useLive(s, setS, setError);
  const recording = useVoiceRecorder({ endpoint: `/api/fluency/${s.id}/audio`, onTranscript: () => {}, onResponse: data => { setS(data.session as unknown as Session); }, onError: setError });
  const cancelRef = useRef(recording.cancel); cancelRef.current = recording.cancel;
  useEffect(() => () => cancelRef.current(), []);
  useEffect(() => { if (!preparing) return; const timer = setInterval(() => setSeconds(n => Math.max(0, n - 1)), 1000); return () => clearInterval(timer); }, [preparing]);
  const round = s.rounds[viewPhase], current = viewPhase === s.phase && s.status === "active";
  const talking = live.state !== "idle", recordingBusy = recording.state !== "idle";
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    try {
      await live.flush();
      const r = await request<{ session: Session }>({ action, id: s.id, phase: viewPhase, ...extra });
      setS(r.session);
      if (action === "advance") { setViewPhase(r.session.phase); setShowHint(false); setCueSaved(false); setSeconds(s.preferences.preparation); setPreparing(false); }
      if (action === "hint") setShowHint(true);
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  };
  const disconnect = async () => { setBusy(true); try { await live.stop(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const leave = async () => { if (recordingBusy) return; await disconnect(); if (!live.unsaved) onBack(); };
  return <Page narrow>
    <PageHeader kicker={`${BLOCKS[s.material.block]} · ${s.material.language === "en" ? "English" : "French"}`} title={s.material.title} actions={<Button variant="outline" disabled={busy || recordingBusy} onClick={() => void leave()}>Back to studio</Button>} />
    {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Practice stages">{stages.map((label, i) => <Button key={label} size="sm" variant={viewPhase === i ? "default" : "outline"} disabled={!s.rounds[i] || busy || talking || recordingBusy} onClick={() => { setViewPhase(i); setCueSaved(false); }}>{i + 1}. {label}</Button>)}</div>
    <section className={`${panel} enter`}>
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-widest text-primary">{s.status === "complete" ? "Session saved" : stages[viewPhase]}</span><span className="text-xs text-muted-foreground">{SKILLS[s.material.skill]}</span></div>
      <p className="my-7 text-xl font-medium leading-relaxed tracking-tight sm:text-2xl">{round.prompt}</p>
      {s.material.passage && <div className="mb-5 rounded-xl bg-muted p-4"><Button size="sm" variant="ghost" onClick={() => setShowPassage(!showPassage)}>{showPassage ? "Hide passage & retell" : "Show passage"}</Button>{showPassage && <p className="mt-3 leading-relaxed">{s.material.passage}</p>}</div>}
      {(showHint || round.hints > 0) && <p className="mb-5 rounded-xl bg-muted p-4 text-sm leading-relaxed">{s.material.hint}</p>}
      {current && !round.review && <>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={busy || talking || recordingBusy} onClick={() => void act("hint")}>Need a hint</Button>{s.preferences.preparation > 0 && <Button variant="ghost" disabled={talking || recordingBusy} onClick={() => { setSeconds(s.preferences.preparation); setPreparing(true); }}>{preparing ? seconds > 0 ? `${seconds}s preparation left` : "Ready when you are" : `Take ${s.preferences.preparation}s to prepare`}</Button>}</div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-5">
          {talking ? <><Button variant="outline" onClick={live.toggleMute} disabled={live.state === "connecting"}>{live.muted ? "Resume conversation" : "Pause conversation"}</Button><Button variant="outline" disabled={busy} onClick={() => void disconnect()}><Square size={15} />Disconnect live voice</Button></> : <>
            {connected && <Button disabled={busy || recordingBusy || live.unsaved > 0} onClick={() => void live.start()}><Volume2 size={16} />Talk with coach</Button>}
            <Button variant={connected ? "outline" : "default"} disabled={busy || recording.state === "transcribing"} onClick={() => recording.state === "recording" ? recording.stop() : void recording.start()}>{recording.state === "recording" ? <Square size={16} /> : <Mic size={16} />}{recording.state === "recording" ? "Finish recording" : recording.state === "transcribing" ? "Saving & transcribing…" : "Record an attempt"}</Button>
          </>}
        </div>
        <p aria-live="polite" className="mt-3 text-xs text-muted-foreground">{talking ? `${live.muted ? "Paused" : live.state === "speaking" ? "Coach speaking" : live.state === "connecting" ? "Connecting microphone…" : "Listening, take your time"}. Pause to think; disconnect after your transcript appears.` : connected ? "Speak with the coach, or record an uninterrupted attempt." : "Record an attempt for coaching feedback. Connect ElevenLabs in settings for live conversation."}</p>
        {talking && live.caption && <p className="mt-4 rounded-xl bg-muted p-4 text-sm leading-relaxed">{live.caption}</p>}
        {!talking && <details className="mt-5 text-sm"><summary className="cursor-pointer text-muted-foreground">Use text instead</summary><Textarea className="mt-3" aria-label="Typed practice attempt" placeholder="Typed practice gets feedback, but does not count as spontaneous speech." value={typed} onChange={e => setTyped(e.target.value)} /><Button className="mt-2" variant="outline" disabled={!typed.trim() || busy || recordingBusy} onClick={async () => { if (await act("turn", { turnId: crypto.randomUUID(), text: typed, source: "typed" })) setTyped(""); }}>Save text attempt</Button></details>}
      </>}
    </section>
    {live.unsaved > 0 && <div role="status" className="mt-4 flex items-center gap-3 rounded-xl border border-border p-4 text-sm">{live.unsaved} turns waiting to save.<Button disabled={busy} onClick={() => void live.flush().catch(e => setError(e.message))}>Retry saving</Button></div>}
    <div className="my-5 flex items-center justify-between"><h2 className="text-sm font-semibold">Your attempt</h2><Button size="sm" variant="ghost" onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? "Hide transcript" : "Show transcript"}</Button></div>
    {showTranscript && <div className="space-y-3">{!round.turns.length && <p className="text-sm text-muted-foreground">Your words will appear here. You can correct anything the microphone mishears.</p>}{round.turns.map(t => <div key={t.id}><Transcript turn={t} id={s.id} phase={viewPhase} editable={!busy && !talking && !recordingBusy} onSaved={setS} onError={setError} />{t.audio && !t.text && current && <Button className="mt-2" variant="outline" disabled={busy || recordingBusy || talking} onClick={async () => { setBusy(true); try { const form = new FormData(); form.set("retry", t.id); const res = await fetch(`/api/fluency/${s.id}/audio`, { method: "POST", body: form }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setS(data.session); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><RotateCcw size={14} />Retry transcription</Button>}</div>)}</div>}
    {!round.review && <Button className="my-5" disabled={busy || talking || recordingBusy || !round.turns.some(t => t.role === "user" && !t.disputed && t.text) || live.unsaved > 0} onClick={() => void act("review")}>{busy ? "Reviewing your words…" : "Review attempt"}<ArrowRight size={16} /></Button>}
    {round.review && <section className={`${panel} mt-5 enter`}>
      <p className="text-xs uppercase tracking-widest text-primary">One thing to practise</p><p className="mt-3 leading-relaxed">{round.review.feedback}</p>
      <p className="mt-4 rounded-xl bg-muted p-4 text-sm font-medium">{round.review.cue}</p>
      {round.review.observations.map((o, i) => <div key={i} className="mt-4 border-l-2 border-primary/30 pl-4"><p className="text-xs text-muted-foreground">{o.kind === "strength" ? "Working well" : "Try improving"} · {SKILLS[o.skill]}</p><blockquote className="my-2 text-sm italic">“{o.quote}”</blockquote><p className="text-sm">{o.note}</p></div>)}
      <Button className="mt-3" size="sm" variant="outline" disabled={busy || cueSaved} onClick={async () => { setBusy(true); try { await request({ action: "phrase", phraseId: `cue-${s.id}-${viewPhase}`, text: round.review!.cue, language: s.material.language, sessionId: s.id }); setCueSaved(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{cueSaved ? "Saved to phrase bank" : "Keep this cue in my phrase bank"}</Button>
      <details className="mt-5 text-sm"><summary className="cursor-pointer text-muted-foreground">See an example answer</summary><p className="mt-3 leading-relaxed">{s.material.example || "No example added for this exercise."}</p><p className="mt-2 text-xs text-muted-foreground">An illustration, not a script to memorize.</p></details>
      {current && <Button className="mt-5" disabled={busy} onClick={() => void act("advance")}>{viewPhase === 0 ? "Try the same prompt again" : viewPhase === 1 ? "Try a fresh prompt" : "Complete practice"}<ArrowRight size={16} /></Button>}
    </section>}
    {current && <Button className="mt-5" variant="ghost" disabled={busy || talking || recordingBusy || live.unsaved > 0} onClick={() => void act("finish")}>Finish session here</Button>}
    {s.status === "complete" && <p className="mt-5 text-sm text-muted-foreground">Saved. Repeated, unassisted speaking across separate sessions helps the coach identify a focus. You can still correct transcripts and review them again.</p>}
  </Page>;
}

export default function FluencyPage() {
  const [data, setData] = useState<Dashboard | null>(null), [s, setS] = useState<Session | null>(null), [block, setBlock] = useState<Block>("conversation"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState("");
  const load = useCallback(async () => { try { setData(await request<Dashboard>()); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); const id = new URLSearchParams(window.location.search).get("session"); if (id) void loadSession(id).then(setS).catch(e => setError(e.message)); }, [load]);
  const open = async (id: string) => { setBusy(true); try { setS(await loadSession(id)); window.history.replaceState(null, "", `/voice?session=${encodeURIComponent(id)}`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  if (s && data) return <Practice key={s.id} initial={s} connected={data.connected} onBack={() => { setS(null); window.history.replaceState(null, "", "/voice"); void load(); }} />;
  const rec = data?.recommendations[block], material = data?.materials.find(m => m.id === selected) ?? rec?.material;
  return <Page>
    <PageHeader kicker="Speak · reflect · repeat" title="Fluency studio" description="Make room for more speaking reps. One useful adjustment at a time." actions={<div className="flex gap-2"><Button asChild variant="outline"><Link href="/voice/capture">Quick capture</Link></Button><Button asChild variant="outline"><Link href="/settings/fluency"><Settings2 size={16} />Manage practice</Link></Button></div>} />
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error} <Button variant="ghost" onClick={() => void load()}>Retry</Button></p>}
    {!data ? <p role="status" className="p-6 text-muted-foreground">Loading your practice…</p> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5"><div className="flex flex-wrap gap-2">{(Object.keys(BLOCKS) as Block[]).map(b => <Button key={b} variant={block === b ? "default" : "outline"} onClick={() => { setBlock(b); setSelected(""); }}>{BLOCKS[b]}</Button>)}</div>
        <section className={`${panel} enter`}><p className="text-xs uppercase tracking-widest text-primary">{data.preferences.language === "en" ? "English" : "French"} · about 7 minutes</p><h2 className="mt-5 text-2xl font-semibold tracking-tight">{material?.title || "Your practice library is ready to grow"}</h2><p className="my-5 text-lg leading-relaxed">{material?.prompt || "Add an exercise for this language and block in Manage practice."}</p><p className="mb-6 text-sm text-muted-foreground">{selected ? `Chosen exercise · ${material ? SKILLS[material.skill] : ""}` : rec?.reason}</p>
          <Button size="lg" disabled={!material || busy} onClick={async () => { setBusy(true); try { const r = await request<{ session: Session }>({ action: "create", materialId: material!.id }); setS(r.session); window.history.replaceState(null, "", `/voice?session=${r.session.id}`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Start practice<ArrowRight size={17} /></Button>
          <div className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-5 text-sm"><span><span className="block text-xs text-muted-foreground">01</span>Speak</span><span><span className="block text-xs text-muted-foreground">02</span>Refine & retry</span><span><span className="block text-xs text-muted-foreground">03</span>Try a new prompt</span></div>
        </section>
        <label className="block text-sm font-medium">Choose another exercise<select aria-label="Choose another exercise" className="mt-2 w-full rounded-lg border border-border bg-background p-3 font-normal" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Coach’s choice</option>{data.materials.filter(m => !m.archived && m.language === data.preferences.language && m.block === block).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        {!data.connected && <p className="text-sm text-muted-foreground">Recorded practice is ready. <Link className="underline" href="/settings/fluency">Connect ElevenLabs</Link> for live conversation.</p>}
      </div>
      <aside className="space-y-5"><section className={panel}><h2 className="font-semibold">What the coach is learning</h2><p className="mt-2 text-sm text-muted-foreground">Patterns need evidence from separate speaking sessions.</p>{data.profile.length === 0 ? <p className="mt-5 text-sm">No assumptions yet. Start with a speaking rep.</p> : data.profile.map(p => <div key={`${p.block}:${p.skill}`} className="mt-4 border-t border-border pt-4"><p className="text-sm font-medium">{SKILLS[p.skill]}</p><p className="mt-1 text-xs text-muted-foreground">{BLOCKS[p.block]} · {p.state} · {new Set(p.evidence.map(e => e.sessionId)).size} sessions with an observation · {new Set(p.strengths.map(e => e.sessionId)).size} with a success</p></div>)}<Link href="/settings/fluency#profile" className="mt-5 inline-block text-sm text-primary underline">Review the evidence</Link></section>
        <section className={panel}><h2 className="font-semibold">Recent practice</h2>{data.sessions.length ? data.sessions.map(item => <button key={item.id} disabled={busy} onClick={() => void open(item.id)} className="mt-3 block w-full rounded-lg p-2 text-left pressable active:scale-[0.97] hover:bg-muted"><span className="block text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()} · {item.status === "active" ? "Resume" : "Review"} · {item.language.toUpperCase()}</span></button>) : <p className="mt-3 text-sm text-muted-foreground">Your attempts and feedback will stay here.</p>}</section>
      </aside>
    </div>}
  </Page>;
}
