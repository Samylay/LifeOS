"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, FlaskConical, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { EMPTY_BRIEF, STAGES, buildGaps, briefMarkdown, briefFromApp, workspaceSlug, type AppBrief, type MicroApp } from "@/lib/micro/model";
import type { CodexSession } from "@/lib/codex-sessions";

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const panel = "work-canvas space-y-5 p-5 sm:p-7";
type Choice = { label: string; detail: string };
async function request<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(url, { method, ...(data !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>{children}{hint && <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span>}</label>;
}

export default function MicroPage() {
  const [apps, setApps] = useState<MicroApp[]>([]);
  const [current, setCurrent] = useState<MicroApp | null>(null);
  const [brief, setBrief] = useState<AppBrief>({ ...EMPTY_BRIEF });
  const [stage, setStage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [research, setResearch] = useState<CodexSession | null>(null);
  const [workspace, setWorkspace] = useState<CodexSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const currentId = useRef<string | null>(null);
  const dirty = current ? JSON.stringify(brief) !== JSON.stringify(briefFromApp(current)) : creating;
  const update = <K extends keyof AppBrief>(key: K, value: AppBrief[K]) => setBrief(prev => ({ ...prev, [key]: value }));
  const refresh = useCallback(async () => { const data = await request<{ apps: MicroApp[] }>("/api/micro/apps"); setApps(data.apps); return data.apps; }, []);
  useEffect(() => { void refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [refresh]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    if (!current?.id) return;
    const id = current.id; let alive = true;
    const poll = async () => {
      try {
        const [r, w] = await Promise.all([
          current.researchSession ? request<{ session: CodexSession }>(`/api/micro/apps/${id}/research`) : Promise.resolve({ session: null }),
          current.workspaceSession ? request<{ session: CodexSession }>(`/api/micro/apps/${id}/launch`) : Promise.resolve({ session: null }),
        ]);
        if (alive) { setResearch(r.session); setWorkspace(w.session); setSessionError(""); }
      } catch (e) { if (alive) setSessionError(e instanceof Error ? e.message : "Session is unavailable."); }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [current?.id, current?.researchSession, current?.workspaceSession]);

  function open(app: MicroApp | null) {
    if (dirty && !window.confirm("Discard the unsaved changes to this brief?")) return;
    currentId.current = app?.id ?? null;
    setCurrent(app); setCreating(!app); setBrief(app ? briefFromApp(app) : { ...EMPTY_BRIEF, features: [] });
    setStage(0); setChoices([]); setResearch(null); setWorkspace(null); setError(""); setSessionError("");
  }
  async function save(): Promise<MicroApp> {
    const url = current ? `/api/micro/apps/${current.id}` : "/api/micro/apps";
    const data = await request<{ app: MicroApp }>(url, current ? "PUT" : "POST", current ? { brief, revision: current.revision } : brief);
    currentId.current = data.app.id;
    setCurrent(data.app); setBrief(briefFromApp(data.app)); setCreating(false);
    setApps(prev => [data.app, ...prev.filter(app => app.id !== data.app.id)]);
    return data.app;
  }
  async function action(kind: string) {
    setBusy(kind); setError("");
    try {
      const app = current && !dirty ? current : await save();
      if (kind === "save") { toast.success("Brief saved"); return; }
      if (kind === "name" || kind === "vibe") {
        const result = await request<{ choices: Choice[] }>(`/api/micro/apps/${app.id}/assist`, "POST", { kind, revision: app.revision });
        if (currentId.current === app.id) setChoices(result.choices);
      } else {
        const result = await request<{ app: MicroApp; session: CodexSession }>(`/api/micro/apps/${app.id}/${kind}`, "POST", { revision: app.revision });
        if (currentId.current === app.id) {
          setCurrent(result.app);
          if (kind === "research") setResearch(result.session); else setWorkspace(result.session);
          toast.success(kind === "research" ? "AppLlama research started" : "Workspace creation started");
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(null); }
  }
  function download() {
    const data = JSON.stringify({ ...brief, markdown: briefMarkdown(brief) }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "micro-brief.json"; a.click(); URL.revokeObjectURL(url);
  }
  const gaps = buildGaps(brief);
  const editor = current || creating;
  return <Page>
    <PageHeader title="Micro" icon={FlaskConical} actions={editor ? <Button disabled={!!busy} onClick={() => void action("save")}><Save size={15} />{busy === "save" ? "Saving…" : dirty ? "Save brief" : "Saved"}</Button> : <Button onClick={() => open(null)}><Plus size={16} />New app</Button>} />
    {error && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}<Button variant="ghost" className="ml-2" disabled={!!busy} onClick={() => { void refresh().then(updated => { if (current) { const match = updated.find(a => a.id === current.id); if (match) open(match); } }).catch(e => setError(e.message)); }}>Reload apps</Button></div>}
    {!editor ? <div className={panel}>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading apps…</p> : apps.length ? <ul className="divide-y divide-border">{apps.map(app => <li key={app.id}><button onClick={() => open(app)} className="pressable flex w-full items-center justify-between gap-4 py-5 text-left active:scale-[0.97]"><span><span className="block font-medium">{app.name || app.title}</span><span className="mt-1 block text-sm text-muted-foreground">{app.features.filter(f => f.scope === "first").length} first-release features · {app.platform} · {app.workspaceSession ? "Workspace requested" : buildGaps(app).length ? "Brief in progress" : "Ready for a workspace"}</span></span><ArrowRight size={18} className="shrink-0 text-muted-foreground" /></button></li>)}</ul> : <div className="flex min-h-64 flex-col items-start justify-center gap-4"><div className="grid size-12 place-items-center rounded-xl bg-secondary text-primary"><FlaskConical size={23} /></div><h2 className="text-xl font-semibold">What do you want to make?</h2><p className="max-w-md text-sm leading-relaxed text-muted-foreground">Start with the people, the problem and the features. Then choose a name, a visual direction and references from real apps.</p><Button onClick={() => open(null)}><Plus size={16} />Create an app brief</Button></div>}
    </div> : <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" disabled={!!busy} onClick={() => { if (dirty && !window.confirm("Discard the unsaved changes?")) return; setCurrent(null); setCreating(false); currentId.current = null; }}><ArrowLeft size={15} />All apps</Button><span className="text-sm text-muted-foreground">{brief.name || brief.title || "New app"}{dirty ? " · Unsaved changes" : ""}</span></div>
      <nav aria-label="App creation stages" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">{STAGES.map((label, index) => <button key={label} aria-current={stage === index ? "step" : undefined} onClick={() => { setStage(index); setChoices([]); }} disabled={!!busy} className={`pressable shrink-0 rounded-lg px-4 py-2.5 text-sm active:scale-[0.97] ${stage === index ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}</nav>
      <fieldset disabled={!!busy} className={panel} key={stage}>
        <legend className="sr-only">{STAGES[stage]}</legend>
        {stage === 0 && <>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Working title"><input className={input} value={brief.title} maxLength={100} onChange={e => update("title", e.target.value)} placeholder="Budgeting app" /></Field><Field label="Platform"><select className={input} value={brief.platform} onChange={e => update("platform", e.target.value as AppBrief["platform"])}><option value="web">Web</option><option value="ios">iOS</option><option value="android">Android</option><option value="ios-android">iOS and Android</option></select></Field></div>
          <Field label="Who is it for?"><input className={input} value={brief.audience} maxLength={1000} onChange={e => update("audience", e.target.value)} placeholder="People with irregular income who want a clear monthly budget" /></Field>
          <Field label="What problem does it solve?" hint="Include the current workaround and any evidence you have."><textarea className={input} rows={3} value={brief.problem} maxLength={2000} onChange={e => update("problem", e.target.value)} /></Field>
          <div className="space-y-3"><h2 className="text-base font-semibold">Features</h2>{brief.features.map((feature, index) => <div key={feature.id} className="space-y-3 rounded-xl border border-border p-4"><div className="flex items-start gap-2"><Field label={`Feature ${index + 1}`}><input className={input} value={feature.title} maxLength={200} onChange={e => update("features", brief.features.map(f => f.id === feature.id ? { ...f, title: e.target.value } : f))} /></Field><Button variant="ghost" size="icon" className="mt-7 shrink-0" aria-label={`Remove feature ${index + 1}`} onClick={() => update("features", brief.features.filter(f => f.id !== feature.id))}><Trash2 size={15} /></Button></div><div className="grid gap-3 sm:grid-cols-[160px_1fr]"><Field label="Scope"><select className={input} value={feature.scope} onChange={e => update("features", brief.features.map(f => f.id === feature.id ? { ...f, scope: e.target.value as "first" | "later" } : f))}><option value="first">First release</option><option value="later">Later</option></select></Field><Field label="How will we know it works?"><textarea className={input} rows={2} maxLength={1500} value={feature.acceptance} onChange={e => update("features", brief.features.map(f => f.id === feature.id ? { ...f, acceptance: e.target.value } : f))} placeholder="Given a new account, when I add income, the available budget updates correctly." /></Field></div></div>)}<Button variant="outline" disabled={brief.features.length >= 60} onClick={() => update("features", [...brief.features, { id: crypto.randomUUID(), title: "", scope: "first", acceptance: "" }])}><Plus size={15} />Add feature</Button></div>
          <Field label="Pricing and first value" hint="A hypothesis is enough. Explain what someone gets before an account or payment is required."><textarea className={input} rows={3} maxLength={2000} value={brief.business} onChange={e => update("business", e.target.value)} /></Field>
        </>}
        {(stage === 1 || stage === 2) && <>
          <Field label={stage === 1 ? "App name" : "Visual direction"} hint={stage === 1 ? "Names are proposals. Domain, store and trademark availability have not been checked." : "Describe palette, typography, density, navigation, voice and how interactions should feel."}>{stage === 1 ? <input className={input} value={brief.name} maxLength={100} onChange={e => update("name", e.target.value)} /> : <textarea className={input} rows={7} maxLength={3000} value={brief.vibe} onChange={e => update("vibe", e.target.value)} />}</Field>
          <Button variant="outline" onClick={() => void action(stage === 1 ? "name" : "vibe")}>{busy ? "Finding directions…" : stage === 1 ? "Suggest names" : "Explore visual directions"}</Button>
          {choices.length > 0 && <div className="grid gap-3 lg:grid-cols-3">{choices.map(choice => <button className="pressable rounded-xl border border-border p-4 text-left active:scale-[0.97]" key={choice.label} onClick={() => { if (stage === 1) update("name", choice.label); else update("vibe", `${choice.label}\n${choice.detail}`); }}><span className="block font-medium">{choice.label}</span><span className="mt-2 block whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{choice.detail}</span><span className="mt-4 flex items-center gap-2 text-xs text-primary"><Check size={13} />Use this direction</span></button>)}</div>}
        </>}
        {stage === 3 && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Study real apps</h2><Button variant="outline" onClick={() => void action("research")} disabled={!!busy || research?.status === "running" || research?.status === "starting"}>Research with AppLlama</Button></div>
          <p className="text-sm leading-relaxed text-muted-foreground">Study complete flows: first value, navigation, repeat use and pricing. Keep the patterns that fit your app. Research starts with up to 12 paid AppLlama calls.</p>
          <Field label="References and decisions" hint="Keep source links and screen IDs, what to borrow, and what to avoid. You can also paste saved posts or explain why a reference does not apply."><textarea className={input} rows={8} maxLength={18000} value={brief.references} onChange={e => update("references", e.target.value)} /></Field>
          {research && <div className="space-y-3 rounded-xl border border-border p-4"><p role="status" className="text-sm font-medium">Research {research.status}</p>{research.progress?.slice(-3).map((line, i) => <p key={i} className="text-xs text-muted-foreground">{line}</p>)}{research.error && <p role="alert" className="text-sm text-destructive">{research.error}</p>}{research.answer && <><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{research.answer}</pre><Button variant="outline" disabled={brief.references.length + research.answer.length + 2 > 18000} onClick={() => update("references", `${brief.references}\n\n${research.answer}`.trim())}>Attach research to brief</Button></>}</div>}
        </>}
        {stage === 4 && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Prepare the build</h2><Button variant="outline" onClick={download}><Download size={15} />Export brief</Button></div>
          {gaps.length ? <div className="rounded-xl bg-muted/50 p-4"><p className="text-sm font-medium">Before creating the workspace</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div> : <p className="flex items-center gap-2 text-sm text-success"><Check size={16} />The brief is ready for a workspace.</p>}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border p-4 font-sans text-sm leading-relaxed">{briefMarkdown(brief)}</pre>
          <p className="text-sm leading-relaxed text-muted-foreground">The workspace inherits the Micro workflow and factory checks. Create it first, then open a Codex task there to refine the specification and build. Publishing and production deployment need the app’s release configuration.</p>
          <Button disabled={gaps.length > 0 || !!busy || (!!workspace && workspace.status !== "failed")} onClick={() => void action("launch")}><Rocket size={16} />{workspace?.status === "failed" ? "Retry workspace creation" : "Create workspace"}</Button>
          {current && <p className="break-all text-xs text-muted-foreground">Project directory: /home/quorky/apps/micro/{workspaceSlug(current.id)}</p>}
          {workspace && <div className="space-y-3 rounded-xl border border-border p-4"><p role="status" className="text-sm font-medium">Workspace {workspace.status}</p>{workspace.error && <p role="alert" className="text-sm text-destructive">{workspace.error}</p>}{workspace.answer && <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{workspace.answer}</pre>}</div>}
        </>}
        {sessionError && <p role="alert" className="text-sm text-destructive">{sessionError}</p>}
      </fieldset>
      <div className="flex justify-between"><Button variant="ghost" disabled={stage === 0 || !!busy} onClick={() => { setStage(stage - 1); setChoices([]); }}><ArrowLeft size={15} />Back</Button><Button variant="outline" disabled={stage === STAGES.length - 1 || !!busy} onClick={() => { setStage(stage + 1); setChoices([]); }}>Next<ArrowRight size={15} /></Button></div>
    </div>}
  </Page>;
}
