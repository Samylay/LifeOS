"use client";

// PROTOTYPE — the four adaptive workspace shapes. Each template is a
// structurally different layout for "acting on an approved card": reading
// room (read → act), study card (learn → anchor → retain), validation bench
// (judge → probe → decide), filing slip (confirm). See ../adaptive-prototype
// NOTES.md for the question this answers.
import { useState } from "react";
import { BookOpen, Check, ExternalLink, FlaskConical, GraduationCap, Inbox, Search } from "lucide-react";
import type { AdaptiveSpec } from "@/lib/adaptive-prototype";
import type { TriageQueueItem } from "@/components/decide/triage-card";

const VERDICT_COLORS: Record<string, string> = {
  pursue: "#22C55E", adopt: "#22C55E",
  maybe: "#F59E0B", try: "#F59E0B",
  skim: "var(--text-tertiary)",
  pass: "#EF4444", skip: "#EF4444",
};

function verdictColor(v?: string) {
  return VERDICT_COLORS[(v ?? "").split(/\W/)[0].toLowerCase()] ?? "var(--text-secondary)";
}

/* ---------- shared atoms (small on purpose; layouts stay independent) ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
      {children}
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
      style={{ color: "var(--accent)" }}>
      <ExternalLink size={12} /> open original
    </a>
  );
}

// Checklist with in-memory state only — persistence is a question for the
// real architecture, not this prototype.
function Steps({ steps }: { steps: NonNullable<AdaptiveSpec["steps"]> }) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  if (steps.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <button key={i}
          onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
          className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-transform duration-150 active:scale-[0.98]"
          style={{ background: "var(--bg-tertiary)" }}>
          <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-opacity duration-150"
            style={{
              width: 18, height: 18,
              borderColor: done[i] ? "var(--accent)" : "var(--text-tertiary)",
              background: done[i] ? "var(--accent)" : "transparent",
            }}>
            {done[i] && <Check size={12} color="white" strokeWidth={3} />}
          </span>
          <span className="text-sm leading-relaxed"
            style={{
              color: done[i] ? "var(--text-tertiary)" : "var(--text-primary)",
              textDecoration: done[i] ? "line-through" : "none",
            }}>
            {s.text}
            {s.detail && <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{s.detail}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- template: reading room (ai-tip / ai-project) ---------- */
// Read → act. The digest IS the page: acting starts here, not on the link.

function ExploreTemplate({ spec, item }: { spec: AdaptiveSpec; item: TriageQueueItem }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <Eyebrow><BookOpen size={11} className="mr-1 inline" />{spec.eyebrow ?? "Reading room"}</Eyebrow>
        <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {spec.headline}
        </h2>
      </header>

      {/* the reading column — digest sections, readable inline */}
      <div className="space-y-4">
        {(spec.reading ?? []).map((r, i) => (
          <section key={i}>
            <h3 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{r.heading}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{r.body}</p>
          </section>
        ))}
      </div>

      {spec.facts && spec.facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {spec.facts.map((f, i) => (
            <span key={i} className="rounded-full px-2.5 py-1 text-xs"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <span className="font-medium">{f.label}</span> {f.value}
            </span>
          ))}
        </div>
      )}

      {spec.steps && spec.steps.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Do this</h3>
          <Steps steps={spec.steps} />
        </section>
      )}

      <SourceLink url={item.url} />
    </div>
  );
}

/* ---------- template: study card (swe) ---------- */
// Learn → anchor → retain. Numbered claims, stack anchors, one self-test.

function StudyTemplate({ spec, item }: { spec: AdaptiveSpec; item: TriageQueueItem }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <Eyebrow><GraduationCap size={11} className="mr-1 inline" />{spec.eyebrow ?? "Study card"}</Eyebrow>
        <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {spec.headline}
        </h2>
      </header>

      {/* numbered claims — order = the argument, so numbering carries meaning */}
      <ol className="space-y-3">
        {(spec.reading ?? []).map((r, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              {i + 1}
            </span>
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.heading}</span>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{r.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {spec.stack && spec.stack.length > 0 && (
        <section className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Where this lands in your stack
          </h3>
          <div className="space-y-1.5">
            {spec.stack.map((s, i) => (
              <div key={i} className="text-sm leading-relaxed">
                <span className="font-medium" style={{ color: "var(--accent)" }}>{s.project}</span>{" "}
                <span style={{ color: "var(--text-primary)" }}>{s.how}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {spec.selftest && (
        <button onClick={() => setRevealed((v) => !v)}
          className="w-full rounded-lg border border-dashed p-3 text-left transition-transform duration-150 active:scale-[0.98]"
          style={{ borderColor: "var(--text-tertiary)" }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Self-test
          </span>
          <p className="mt-1 text-sm leading-relaxed"
            style={{
              color: "var(--text-primary)",
              filter: revealed ? "none" : "blur(4px)",
              transition: "filter var(--dur-base) var(--ease-out-custom)",
            }}>
            {spec.selftest}
          </p>
          {!revealed && <span className="text-xs" style={{ color: "var(--accent)" }}>tap to reveal</span>}
        </button>
      )}

      {spec.steps && spec.steps.length > 0 && <Steps steps={spec.steps} />}
      <SourceLink url={item.url} />
    </div>
  );
}

/* ---------- template: validation bench (business-idea) ---------- */
// Judge → probe → decide. Verdict banner, triptych, kill criteria.

function ValidateTemplate({ spec, item }: { spec: AdaptiveSpec; item: TriageQueueItem }) {
  const verdict = item.proposal?.assessment?.verdict ?? "";
  const color = verdictColor(verdict);
  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <Eyebrow><FlaskConical size={11} className="mr-1 inline" />{spec.eyebrow ?? "Validation bench"}</Eyebrow>
        <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {spec.headline}
        </h2>
      </header>

      <div className="rounded-lg border-l-4 p-3" style={{ borderColor: color, background: "var(--bg-tertiary)" }}>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          {verdict || "no verdict"}
        </span>
        {(spec.reading ?? []).slice(0, 1).map((r, i) => (
          <p key={i} className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{r.body}</p>
        ))}
      </div>

      {/* the triptych — demand / effort / payoff side by side */}
      {spec.facts && spec.facts.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(spec.facts.length, 3)}, 1fr)` }}>
          {spec.facts.map((f, i) => (
            <div key={i} className="rounded-lg p-2.5" style={{ background: "var(--bg-tertiary)" }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                {f.label}
              </div>
              <div className="mt-0.5 text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {spec.risk && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <span className="font-semibold" style={{ color: "#EF4444" }}>Main risk: </span>{spec.risk}
        </p>
      )}

      {spec.steps && spec.steps.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Before building anything</h3>
          <Steps steps={spec.steps} />
        </section>
      )}

      {spec.cta?.kind === "research" && (
        <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97]"
          style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
          onClick={() => alert("Prototype stub — real version would queue a research agent run.")}>
          <Search size={14} /> {spec.cta.label}
        </button>
      )}

      <SourceLink url={item.url} />
    </div>
  );
}

/* ---------- template: filing slip (fallback) ---------- */

function FileTemplate({ spec, item }: { spec: AdaptiveSpec; item: TriageQueueItem }) {
  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <Eyebrow><Inbox size={11} className="mr-1 inline" />{spec.eyebrow ?? "Filed"}</Eyebrow>
        <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {spec.headline}
        </h2>
      </header>
      {(spec.reading ?? []).map((r, i) => (
        <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{r.body}</p>
      ))}
      <SourceLink url={item.url} />
    </div>
  );
}

export function AdaptiveWorkspace({ spec, item }: { spec: AdaptiveSpec; item: TriageQueueItem }) {
  switch (spec.template) {
    case "explore": return <ExploreTemplate spec={spec} item={item} />;
    case "study": return <StudyTemplate spec={spec} item={item} />;
    case "validate": return <ValidateTemplate spec={spec} item={item} />;
    default: return <FileTemplate spec={spec} item={item} />;
  }
}
