"use client";

import { useState } from "react";
import {
  AlertTriangle, Calendar, CheckSquare, ChevronDown, Dumbbell, ExternalLink,
  Link2, Mic, Newspaper, Rocket, Server, ShieldAlert, Square,
} from "lucide-react";
import type {
  Brief, BriefCard, FtHeadlinesBody, FuiteBody, HomelabBody, PromptBody,
  ShipsBody, WorkBody, WorkoutBody,
} from "@/lib/brief-types";
import { TalkCard } from "./talk-card";

const STATUS_COLOR: Record<string, string> = {
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
  neutral: "var(--text-tertiary)",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  workout: <Dumbbell size={15} />,
  work: <CheckSquare size={15} />,
  homelab: <Server size={15} />,
  fuite: <ShieldAlert size={15} />,
  ft_headlines: <Newspaper size={15} />,
  quorky_digest: <Link2 size={15} />,
  prompt: <Mic size={15} />,
  ships: <Rocket size={15} />,
  planning: <Calendar size={15} />,
};

/** Single-line summary shown when a state card is collapsed. */
function oneLiner(card: BriefCard): string {
  if (card.error) return "unavailable";
  switch (card.type) {
    case "homelab":
      return (card.body as unknown as HomelabBody).summary || "all good";
    case "fuite": {
      const n = (card.body as unknown as FuiteBody).entries?.length ?? 0;
      return n === 0 ? "no new leaks" : `${n} ${n === 1 ? "entry" : "entries"}`;
    }
    case "ft_headlines": {
      const b = card.body as unknown as FtHeadlinesBody;
      const n = b.headlines?.length ?? 0;
      return `${n} headlines · ${b.edition_date ?? ""}`;
    }
    case "quorky_digest":
      return "today's edition";
    default:
      return "";
  }
}

function CardShell({ card, children }: { card: BriefCard; children: React.ReactNode }) {
  const isState = card.priority === "state";
  const startCollapsed = isState && card.status === "green" && !card.error;
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const collapsible = isState;

  return (
    <div
      className="rounded-xl transition-all"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <button
        onClick={() => collapsible && setCollapsed((c) => !c)}
        disabled={!collapsible}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        style={{ cursor: collapsible ? "pointer" : "default" }}
      >
        <span
          className="shrink-0 h-2.5 w-2.5 rounded-full"
          style={{
            background: STATUS_COLOR[card.status] ?? STATUS_COLOR.neutral,
            boxShadow: card.status === "green" ? "0 0 6px -1px #22C55E" : "none",
          }}
        />
        <span style={{ color: "var(--text-secondary)" }}>{TYPE_ICON[card.type] ?? <Link2 size={15} />}</span>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {card.title}
        </span>
        {collapsed && (
          <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
            {oneLiner(card)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {card.link && !collapsed && (
            <a
              href={card.link}
              target={card.link.startsWith("/") ? undefined : "_blank"}
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--text-tertiary)" }}
            >
              <ExternalLink size={13} />
            </a>
          )}
          {collapsible && (
            <ChevronDown
              size={14}
              className="transition-transform"
              style={{ color: "var(--text-tertiary)", transform: collapsed ? "none" : "rotate(180deg)" }}
            />
          )}
        </span>
      </button>
      {!collapsed && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ErrorBody({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg p-3"
      style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
      <span>Source unavailable — {error}</span>
    </div>
  );
}

function WorkoutCard({ card, date }: { card: BriefCard; date: string }) {
  const body = card.body as unknown as WorkoutBody;
  const storageKey = `brief-workout-${date}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const toggle = (name: string) => {
    const next = { ...done, [name]: !done[name] };
    setDone(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  if (body.rest) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Rest day — recover well.</p>;
  }
  return (
    <div className="space-y-1">
      {body.day_label && (
        <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{body.day_label}</p>
      )}
      {(body.exercises ?? []).map((ex) => (
        <button key={ex.name} onClick={() => toggle(ex.name)}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left"
          style={{ background: "var(--bg-tertiary)" }}>
          {done[ex.name]
            ? <CheckSquare size={15} style={{ color: "#22C55E" }} />
            : <Square size={15} style={{ color: "var(--text-tertiary)" }} />}
          <span className="text-sm" style={{
            color: done[ex.name] ? "var(--text-tertiary)" : "var(--text-primary)",
            textDecoration: done[ex.name] ? "line-through" : "none",
          }}>
            {ex.name}
          </span>
          <span className="ml-auto text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
            {ex.sets}×{ex.reps}
          </span>
        </button>
      ))}
    </div>
  );
}

const TODOIST_PRIORITY_COLOR: Record<number, string> = { 4: "#EF4444", 3: "#F59E0B", 2: "#3B82F6" };

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function WorkCard({ card }: { card: BriefCard }) {
  const body = card.body as unknown as WorkBody;
  const tasks = body.tasks ?? [];
  const events = body.events ?? [];
  const done = body.completed_yesterday;
  const doneLine = done && done.count > 0 && (
    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
      ✓ {done.count} done yesterday: {done.items.join(", ")}{done.count > done.items.length ? ", …" : ""}
    </p>
  );
  if (tasks.length === 0 && events.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nothing due today. Pick a project.</p>
        {doneLine}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {doneLine}
      {events.length > 0 && (
        <div className="space-y-1">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <Calendar size={13} style={{ color: "var(--accent)" }} />
              <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>{fmtTime(ev.start)}</span>
              <span>{ev.title}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2"
            style={{ background: "var(--bg-tertiary)" }}>
            <span className="shrink-0 h-2 w-2 rounded-full"
              style={{ background: TODOIST_PRIORITY_COLOR[t.priority ?? 1] ?? "var(--text-tertiary)" }} />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{t.content}</span>
            {t.url && (
              <a href={t.url} target="_blank" rel="noreferrer" className="ml-auto" style={{ color: "var(--text-tertiary)" }}>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HomelabCard({ card }: { card: BriefCard }) {
  const body = card.body as unknown as HomelabBody;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>{body.containers_up}/{body.containers_total} containers</span>
        {body.disk_pct != null && <span>disk {body.disk_pct}%</span>}
        <span>tailscale {body.tailscale_ok ? "✓" : "✗"}</span>
        <span>ollama {body.ollama_ok ? "✓" : "✗"}</span>
        {body.goals_enabled && (
          <span>goals {body.goals_ok}/{body.goals_total} {body.goals_violated?.length ? "✗" : "✓"}</span>
        )}
      </div>
      {(body.issues ?? []).map((issue, i) => (
        <div key={i} className="flex items-start gap-2 text-sm rounded-lg px-3 py-2"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: STATUS_COLOR[card.status] }} />
          {issue}
        </div>
      ))}
    </div>
  );
}

const FUITE_DOT: Record<string, string> = { green: "🟢", orange: "🟠", red: "🔴" };

function FuiteCard({ card }: { card: BriefCard }) {
  const body = card.body as unknown as FuiteBody;
  const entries = body.entries ?? [];
  if (entries.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No new leaks reported.</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2"
          style={{ background: "var(--bg-tertiary)" }}>
          <span>{FUITE_DOT[e.status] ?? "⚪"}</span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{e.org}</span>
          <span className="text-xs truncate ml-auto" style={{ color: "var(--text-tertiary)" }}>
            {(e.data_types ?? []).join(", ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function FtCard({ card }: { card: BriefCard }) {
  const body = card.body as unknown as FtHeadlinesBody;
  return (
    <div className="space-y-1.5">
      {(body.headlines ?? []).map((h, i) => (
        <div key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>
          {h.text}
          <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            {(h.topics ?? []).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function DigestCard({ card }: { card: BriefCard }) {
  return (
    <a href={card.link ?? "#"} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 text-sm" style={{ color: "var(--accent)" }}>
      Read today&apos;s digest <ExternalLink size={12} />
    </a>
  );
}

interface PlanningCardBody {
  date?: string;
  blocks?: { eventId: string; title: string; startIso: string; endIso: string }[];
  placements?: { id: string; content: string }[];
  placements_error?: string | null;
  invite?: string;
  error_hint?: string;
}

function PlanningCard({ card }: { card: BriefCard }) {
  const b = card.body as unknown as PlanningCardBody;
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/plan/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await r.json()) as { ok: boolean; summary?: string; error?: string };
      setFeedback(data.summary ?? data.error ?? "No response.");
      if (data.ok) setReply("");
    } catch {
      setFeedback("Request failed.");
    } finally {
      setSending(false);
    }
  };

  if (b.error_hint) {
    return <p className="text-xs" style={{ color: "#F59E0B" }}>{b.error_hint}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {(b.blocks ?? []).map((blk) => (
          <div key={blk.eventId} className="flex items-baseline gap-3 text-sm">
            <span className="font-mono text-xs shrink-0" style={{ color: "var(--text-tertiary)" }}>
              {fmtTime(blk.startIso)}–{fmtTime(blk.endIso)}
            </span>
            <span style={{ color: "var(--text-primary)" }}>{blk.title}</span>
          </div>
        ))}
        {(b.blocks ?? []).length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No tentative blocks today.</p>
        )}
      </div>

      {(b.placements ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Where should these go? (unscheduled Todoist tasks)
          </p>
          <ul className="space-y-0.5">
            {(b.placements ?? []).map((p) => (
              <li key={p.id} className="text-xs" style={{ color: "var(--text-secondary)" }}>• {p.content}</li>
            ))}
          </ul>
        </div>
      )}
      {b.placements_error && (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Todoist unavailable — placements skipped.</p>
      )}

      {b.invite && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{b.invite}</p>}

      <div className="flex items-center gap-2">
        <input
          type="text" value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
          placeholder='e.g. "push the workout to 6pm"'
          className="flex-1 text-xs rounded-lg px-3 py-2 outline-none"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
        />
        <button onClick={sendReply} disabled={sending}
          className="text-xs px-3 py-2 rounded-lg bg-sage-400 text-white font-medium disabled:opacity-50">
          {sending ? "…" : "Send"}
        </button>
      </div>
      {feedback && <p className="text-xs" style={{ color: "var(--accent)" }}>{feedback}</p>}
    </div>
  );
}

function ShipsCard({ card }: { card: BriefCard }) {
  const b = card.body as unknown as ShipsBody;
  return (
    <div className="space-y-2">
      {b.tripwire && (
        <p className="text-xs rounded-lg p-3" style={{ background: "#EF444415", color: "#EF4444" }}>
          Nothing has left the machine in 30 days. Building is not shipping —
          what&apos;s the smallest thing that can ship this week?
        </p>
      )}
      {b.projects.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No active projects.</p>
      ) : (
        <div className="space-y-1.5">
          {b.projects.map((p) => (
            <div key={p.title} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span style={{ color: "var(--text-primary)" }}>{p.title}</span>
                {!p.shipping_event && (
                  <span className="ml-2 text-xs" style={{ color: "#F59E0B" }}>no shipping event</span>
                )}
              </div>
              <span className="text-xs font-mono shrink-0"
                style={{ color: p.days > 14 ? "#EF4444" : p.days > 7 ? "#F59E0B" : "var(--text-tertiary)" }}>
                {p.never_shipped ? `never shipped · ${p.days}d old` : `${p.days}d since ship`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs pt-1" style={{ color: "var(--text-tertiary)" }}>
        {b.shipped_30d} shipped in the last 30 days
      </p>
    </div>
  );
}

function CardBody({ card, date }: { card: BriefCard; date: string }) {
  if (card.error) return <ErrorBody error={card.error} />;
  switch (card.type) {
    case "planning": return <PlanningCard card={card} />;
    case "ships": return <ShipsCard card={card} />;
    case "workout": return <WorkoutCard card={card} date={date} />;
    case "work": return <WorkCard card={card} />;
    case "homelab": return <HomelabCard card={card} />;
    case "fuite": return <FuiteCard card={card} />;
    case "ft_headlines": return <FtCard card={card} />;
    case "quorky_digest": return <DigestCard card={card} />;
    // "prompt" cards never reach CardBody individually — BriefCards merges
    // them into one TalkCard (errored ones fall through to ErrorBody above).
    default:
      return (
        <pre className="text-xs overflow-x-auto" style={{ color: "var(--text-tertiary)" }}>
          {JSON.stringify(card.body, null, 2)}
        </pre>
      );
  }
}

export function BriefCards({ brief }: { brief: Brief }) {
  // Action cards first, stable order within each group; red/amber state cards
  // surface above green ones so a bad morning is visible without scrolling.
  const severity: Record<string, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
  const cards = [...brief.cards].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "action" ? -1 : 1;
    if (a.priority === "state") return (severity[a.status] ?? 2) - (severity[b.status] ?? 2);
    return 0;
  });

  // One list of things to talk about, one recorder: all healthy prompt cards
  // (morning prompt + objective questions) collapse into a single TalkCard,
  // rendered where the first of them would have appeared. Errored prompt
  // cards keep their individual error display.
  const talkPrompts = cards
    .filter((c) => c.type === "prompt" && !c.error)
    .map((c) => c.body as unknown as PromptBody);
  const firstTalkId = cards.find((c) => c.type === "prompt" && !c.error)?.id;

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        if (card.type === "prompt" && !card.error) {
          if (card.id !== firstTalkId) return null;
          return (
            <CardShell key="talk" card={{ ...card, title: "Things to talk about" }}>
              <TalkCard prompts={talkPrompts} date={brief.date} />
            </CardShell>
          );
        }
        return (
          <CardShell key={card.id} card={card}>
            <CardBody card={card} date={brief.date} />
          </CardShell>
        );
      })}
    </div>
  );
}
