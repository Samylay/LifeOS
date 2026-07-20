"use client";

// PROTOTYPE — block interpreter for the adaptive template bank. A template
// (seed or minted) is an ordered list of whitelisted blocks; each block reads
// a slot of the generated spec and collapses when its slot is empty. Unknown
// blocks are skipped, so a minted template can never render anything outside
// this file's primitives. See ../adaptive-prototype NOTES.md.
//
// Workspace state (checklist ticks, self-test reveals) persists per item in
// `users/local/adaptiveWorkspaceState` — optimistic, reverts on failed save.
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen, Check, Compass, ExternalLink, FlaskConical, GraduationCap,
  Inbox, Layers, Lightbulb, Search, Target, Wrench,
} from "lucide-react";
import type { AdaptiveSpec, BlockDef, IconName, TemplateDef } from "@/lib/adaptive-prototype";
import type { TriageQueueItem } from "@/components/decide/triage-card";

const ICONS: Record<IconName, typeof BookOpen> = {
  book: BookOpen, graduation: GraduationCap, flask: FlaskConical,
  inbox: Inbox, search: Search, wrench: Wrench, lightbulb: Lightbulb,
  compass: Compass, target: Target, layers: Layers,
};

const VERDICT_COLORS: Record<string, string> = {
  pursue: "var(--success)", adopt: "var(--success)",
  maybe: "var(--warning)", try: "var(--warning)",
  skim: "var(--muted-foreground)",
  pass: "#EF4444", skip: "#EF4444",
};

function verdictColor(v?: string) {
  return VERDICT_COLORS[(v ?? "").split(/\W/)[0].toLowerCase()] ?? "var(--muted-foreground)";
}

/* ---------- persisted workspace state ---------- */

interface WorkspaceState {
  steps: Record<string, boolean>;
  revealed?: boolean;
}

function useWorkspaceState(itemId: string) {
  const [state, setState] = useState<WorkspaceState>({ steps: {} });
  useEffect(() => {
    let live = true;
    fetch(`/api/data/users/local/adaptiveWorkspaceState/${itemId}`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d.doc) setState({ steps: d.doc.steps ?? {}, revealed: d.doc.revealed });
      })
      .catch(() => {});
    return () => { live = false; };
  }, [itemId]);

  const save = useCallback(
    (next: WorkspaceState, prev: WorkspaceState) => {
      setState(next); // optimistic
      fetch(`/api/data/users/local/adaptiveWorkspaceState/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...next, updatedAt: new Date().toISOString() }),
      }).then((r) => { if (!r.ok) setState(prev); })
        .catch(() => setState(prev)); // revert = the tick visibly undoes itself
    },
    [itemId],
  );

  return { state, save };
}

/* ---------- shared atoms ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/* ---------- block renderers ---------- */

type Ctx = {
  spec: AdaptiveSpec;
  item: TriageQueueItem;
  ws: ReturnType<typeof useWorkspaceState>;
  fallbackIcon?: IconName;
};

function HeaderBlock({ def, ctx }: { def: Extract<BlockDef, { block: "header" }>; ctx: Ctx }) {
  const Icon = ICONS[def.icon ?? ctx.fallbackIcon ?? "inbox"];
  return (
    <header className="space-y-1.5">
      <Eyebrow><Icon size={11} className="mr-1 inline" />{ctx.spec.eyebrow ?? ""}</Eyebrow>
      <h2 className="text-xl font-semibold leading-snug text-foreground">
        {ctx.spec.headline}
      </h2>
    </header>
  );
}

function ReadingBlock({ def, ctx }: { def: Extract<BlockDef, { block: "reading" }>; ctx: Ctx }) {
  const reading = ctx.spec.reading ?? [];
  if (reading.length === 0) return null;
  if (def.style === "claims") {
    return (
      <ol className="space-y-3">
        {reading.map((r, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {i + 1}
            </span>
            <div>
              <span className="text-sm font-semibold text-foreground">{r.heading}</span>
              <p className="text-sm leading-relaxed text-muted-foreground">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="space-y-4">
      {def.heading && (
        <h3 className="text-sm font-semibold text-muted-foreground">{def.heading}</h3>
      )}
      {reading.map((r, i) => (
        <section key={i}>
          <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{r.heading}</h3>
          <p className="text-sm leading-relaxed text-foreground">{r.body}</p>
        </section>
      ))}
    </div>
  );
}

function FactsBlock({ def, ctx }: { def: Extract<BlockDef, { block: "facts" }>; ctx: Ctx }) {
  const facts = ctx.spec.facts ?? [];
  if (facts.length === 0) return null;
  if (def.style === "grid") {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(facts.length, 3)}, 1fr)` }}>
        {facts.map((f, i) => (
          <div key={i} className="rounded-lg bg-muted p-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </div>
            <div className="mt-0.5 text-sm leading-snug text-foreground">{f.value}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {facts.map((f, i) => (
        <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium">{f.label}</span> {f.value}
        </span>
      ))}
    </div>
  );
}

function VerdictBlock({ ctx }: { ctx: Ctx }) {
  const verdict = ctx.item.proposal?.assessment?.verdict ?? "";
  const body = (ctx.spec.reading ?? [])[0]?.body;
  const color = verdictColor(verdict);
  return (
    <div className="rounded-lg border-l-4 bg-muted p-3" style={{ borderColor: color }}>
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {verdict || "no verdict"}
      </span>
      {body && <p className="mt-1 text-sm leading-relaxed text-foreground">{body}</p>}
    </div>
  );
}

function RiskBlock({ ctx }: { ctx: Ctx }) {
  if (!ctx.spec.risk) return null;
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold text-destructive">Main risk: </span>{ctx.spec.risk}
    </p>
  );
}

function StackBlock({ def, ctx }: { def: Extract<BlockDef, { block: "stack" }>; ctx: Ctx }) {
  const stack = ctx.spec.stack ?? [];
  if (stack.length === 0) return null;
  return (
    <section className="rounded-lg bg-muted p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {def.heading ?? "Where this lands in your stack"}
      </h3>
      <div className="space-y-1.5">
        {stack.map((s, i) => (
          <div key={i} className="text-sm leading-relaxed">
            <span className="font-medium text-primary">{s.project}</span>{" "}
            <span className="text-foreground">{s.how}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SelftestBlock({ ctx }: { ctx: Ctx }) {
  const { state, save } = ctx.ws;
  if (!ctx.spec.selftest) return null;
  const revealed = state.revealed ?? false;
  return (
    <button onClick={() => save({ ...state, revealed: !revealed }, state)}
      className="w-full rounded-lg border border-dashed border-muted-foreground p-3 text-left transition-transform duration-150 active:scale-[0.98]">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Self-test
      </span>
      <p className="mt-1 text-sm leading-relaxed text-foreground"
        style={{
          filter: revealed ? "none" : "blur(4px)",
          transition: "filter var(--dur-base) var(--ease-out-custom)",
        }}>
        {ctx.spec.selftest}
      </p>
      {!revealed && <span className="text-xs text-primary">tap to reveal</span>}
    </button>
  );
}

function StepsBlock({ def, ctx }: { def: Extract<BlockDef, { block: "steps" }>; ctx: Ctx }) {
  const steps = ctx.spec.steps ?? [];
  const { state, save } = ctx.ws;
  if (steps.length === 0) return null;
  const toggle = (i: number) => {
    const key = String(i);
    save({ ...state, steps: { ...state.steps, [key]: !state.steps[key] } }, state);
  };
  const list = (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const done = Boolean(state.steps[String(i)]);
        return (
          <button key={i} onClick={() => toggle(i)}
            className="flex w-full items-start gap-2.5 rounded-lg bg-muted p-2.5 text-left transition-transform duration-150 active:scale-[0.98]">
            <span className="mt-0.5 flex shrink-0 items-center justify-center rounded border transition-opacity duration-150"
              style={{
                width: 18, height: 18,
                borderColor: done ? "var(--primary)" : "var(--muted-foreground)",
                background: done ? "var(--primary)" : "transparent",
              }}>
              {done && <Check size={12} color="white" strokeWidth={3} />}
            </span>
            <span className="text-sm leading-relaxed"
              style={{
                color: done ? "var(--muted-foreground)" : "var(--foreground)",
                textDecoration: done ? "line-through" : "none",
              }}>
              {s.text}
              {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
  if (!def.heading) return list;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{def.heading}</h3>
      {list}
    </section>
  );
}

function CtaBlock({ ctx }: { ctx: Ctx }) {
  const cta = ctx.spec.cta;
  if (!cta || cta.kind !== "research") return null;
  return (
    <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-150 active:scale-[0.97]"
      onClick={() => alert("Prototype stub — real version would queue a research agent run.")}>
      <Search size={14} /> {cta.label}
    </button>
  );
}

function LinkBlock({ ctx }: { ctx: Ctx }) {
  return (
    <a href={ctx.item.url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-150 active:scale-[0.97]">
      <ExternalLink size={12} /> open original
    </a>
  );
}

function renderBlock(def: BlockDef, i: number, ctx: Ctx) {
  switch (def.block) {
    case "header": return <HeaderBlock key={i} def={def} ctx={ctx} />;
    case "reading": return <ReadingBlock key={i} def={def} ctx={ctx} />;
    case "facts": return <FactsBlock key={i} def={def} ctx={ctx} />;
    case "verdict": return <VerdictBlock key={i} ctx={ctx} />;
    case "risk": return <RiskBlock key={i} ctx={ctx} />;
    case "stack": return <StackBlock key={i} def={def} ctx={ctx} />;
    case "selftest": return <SelftestBlock key={i} ctx={ctx} />;
    case "steps": return <StepsBlock key={i} def={def} ctx={ctx} />;
    case "cta": return <CtaBlock key={i} ctx={ctx} />;
    case "link": return <LinkBlock key={i} ctx={ctx} />;
    default: return null; // unknown block from a bad mint: skip, never crash
  }
}

export function AdaptiveWorkspace({
  spec, item, template,
}: {
  spec: AdaptiveSpec;
  item: TriageQueueItem;
  template: TemplateDef;
}) {
  const ws = useWorkspaceState(item.id);
  const ctx: Ctx = { spec, item, ws };
  return (
    <div className="space-y-5">
      {template.layout.map((def, i) => renderBlock(def, i, ctx))}
    </div>
  );
}
