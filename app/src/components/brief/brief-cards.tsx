"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle, Bookmark, Calendar, CheckSquare, ChevronDown, Dumbbell, ExternalLink,
  Link2, Mic, Newspaper, Rocket, Server, ShieldAlert, Square,
} from "lucide-react";
import type {
  Brief, BriefCard, FtHeadlinesBody, FuiteBody, HomelabBody, PromptBody,
  ShipsBody, TriageBody, WorkBody, WorkoutBody,
} from "@/lib/brief-types";
import { TalkCard } from "./talk-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_COLOR: Record<string, string> = {
  green: "var(--success)",
  amber: "var(--warning)",
  red: "var(--destructive)",
  neutral: "var(--muted-foreground)",
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
  triage: <Bookmark size={15} />,
};

const TRIAGE_DEST_COLOR: Record<string, string> = {
  "idea-bank": "#8B5CF6",
  vault: "#6366F1",
  discard: "var(--muted-foreground)",
};
function destColor(dest: string): string {
  if (dest.startsWith("backlog")) return "#14B8A6";
  if (dest.startsWith("roadmap")) return "#F59E0B";
  return TRIAGE_DEST_COLOR[dest] ?? "var(--primary)";
}

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
    <Card className="gap-0 py-0 rounded-xl transition-[background,border-color]">
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
            boxShadow: card.status === "green" ? "0 0 6px -1px var(--success)" : "none",
          }}
        />
        <span className="text-muted-foreground">{TYPE_ICON[card.type] ?? <Link2 size={15} />}</span>
        <span className="text-sm font-semibold text-foreground">
          {card.title}
        </span>
        {collapsed && (
          <span className="text-xs truncate text-muted-foreground/70">
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
              className="text-muted-foreground/70"
            >
              <ExternalLink size={13} />
            </a>
          )}
          {collapsible && (
            <ChevronDown
              size={14}
              className="transition-transform text-muted-foreground/70"
              style={{ transform: collapsed ? "none" : "rotate(180deg)" }}
            />
          )}
        </span>
      </button>
      {!collapsed && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

function ErrorBody({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg p-3 bg-muted text-muted-foreground/70">
      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
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
    return <p className="text-sm text-muted-foreground">Rest day — recover well.</p>;
  }
  return (
    <div className="space-y-1">
      {body.day_label && (
        <p className="text-xs mb-2 text-muted-foreground/70">{body.day_label}</p>
      )}
      {(body.exercises ?? []).map((ex) => (
        <button key={ex.name} onClick={() => toggle(ex.name)}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left bg-muted">
          {done[ex.name]
            ? <CheckSquare size={15} className="text-emerald-500" />
            : <Square size={15} className="text-muted-foreground/70" />}
          <span className={`text-sm ${done[ex.name] ? "text-muted-foreground/70 line-through" : "text-foreground"}`}>
            {ex.name}
          </span>
          <span className="ml-auto text-xs font-mono text-muted-foreground/70">
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
    <p className="text-xs text-muted-foreground/70">
      ✓ {done.count} done yesterday: {done.items.join(", ")}{done.count > done.items.length ? ", …" : ""}
    </p>
  );
  if (tasks.length === 0 && events.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Nothing due today. Pick a project.</p>
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
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar size={13} className="text-primary" />
              <span className="font-mono text-xs text-muted-foreground/70">{fmtTime(ev.start)}</span>
              <span>{ev.title}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-muted">
            <span className="shrink-0 h-2 w-2 rounded-full"
              style={{ background: TODOIST_PRIORITY_COLOR[t.priority ?? 1] ?? "var(--muted-foreground)" }} />
            <span className="text-sm text-foreground">{t.content}</span>
            {t.url && (
              <a href={t.url} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground/70">
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{body.containers_up}/{body.containers_total} containers</span>
        {body.disk_pct != null && <span>disk {body.disk_pct}%</span>}
        <span>tailscale {body.tailscale_ok ? "✓" : "✗"}</span>
        <span>ollama {body.ollama_ok ? "✓" : "✗"}</span>
        {body.goals_enabled && (
          <span>goals {body.goals_ok}/{body.goals_total} {body.goals_violated?.length ? "✗" : "✓"}</span>
        )}
      </div>
      {(body.issues ?? []).map((issue, i) => (
        <div key={i} className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 bg-muted text-foreground">
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
    return <p className="text-sm text-muted-foreground">No new leaks reported.</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-muted">
          <span>{FUITE_DOT[e.status] ?? "⚪"}</span>
          <span className="font-medium text-foreground">{e.org}</span>
          <span className="text-xs truncate ml-auto text-muted-foreground/70">
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
        <div key={i} className="text-sm text-foreground">
          {h.text}
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {(h.topics ?? []).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DigestCardBody {
  edition_date?: string;
  total?: number;
  headlines?: { title: string; link: string; source: string; section: string; score: number; summary: string }[];
}

function DigestCard({ card }: { card: BriefCard }) {
  const body = card.body as unknown as DigestCardBody;
  const headlines = body.headlines ?? [];
  const mark = (s: number) => (s >= 5 ? "🔥" : s >= 4 ? "⭐" : "•");
  return (
    <div className="space-y-2">
      {headlines.map((h, i) => (
        <a
          key={i}
          href={h.link}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-foreground transition-transform duration-150 active:scale-[0.99]"
        >
          <span aria-hidden>{mark(h.score)}</span> {h.title}
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {h.source}
          </span>
        </a>
      ))}
      <Link href={card.link ?? "/news"} className="flex items-center gap-2 text-sm text-primary">
        {body.total && body.total > headlines.length ? `View all ${body.total} in News` : "Open News"}{" "}
        <ExternalLink size={12} />
      </Link>
    </div>
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
    return <p className="text-xs text-amber-500">{b.error_hint}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {(b.blocks ?? []).map((blk) => (
          <div key={blk.eventId} className="flex items-baseline gap-3 text-sm">
            <span className="font-mono text-xs shrink-0 text-muted-foreground/70">
              {fmtTime(blk.startIso)}–{fmtTime(blk.endIso)}
            </span>
            <span className="text-foreground">{blk.title}</span>
          </div>
        ))}
        {(b.blocks ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground/70">No tentative blocks today.</p>
        )}
      </div>

      {(b.placements ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-muted-foreground">
            Where should these go? (unscheduled Todoist tasks)
          </p>
          <ul className="space-y-0.5">
            {(b.placements ?? []).map((p) => (
              <li key={p.id} className="text-xs text-muted-foreground">• {p.content}</li>
            ))}
          </ul>
        </div>
      )}
      {b.placements_error && (
        <p className="text-xs text-muted-foreground/70">Todoist unavailable — placements skipped.</p>
      )}

      {b.invite && <p className="text-xs text-muted-foreground/70">{b.invite}</p>}

      <div className="flex items-center gap-2">
        <Input
          type="text" value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
          placeholder='e.g. "push the workout to 6pm"'
          className="flex-1 h-auto text-xs rounded-lg px-3 py-2"
        />
        <Button onClick={sendReply} disabled={sending} size="sm" className="text-xs">
          {sending ? "…" : "Send"}
        </Button>
      </div>
      {feedback && <p className="text-xs text-primary">{feedback}</p>}
    </div>
  );
}

function TriageCard({ card }: { card: BriefCard }) {
  const b = card.body as unknown as TriageBody;
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/triage/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: b.source }),
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

  const row = (it: TriageBody["keep"][number]) => (
    <div key={it.id} className="flex items-baseline gap-2 text-sm">
      <span className="font-mono text-xs shrink-0 text-muted-foreground/70" style={{ minWidth: 16 }}>{it.n}</span>
      <div className="min-w-0">
        <span className="text-foreground">{it.summary || it.url}</span>
        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: `${destColor(it.destination)}20`, color: destColor(it.destination) }}>
          {it.destination}
        </span>
        <a href={it.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-block align-middle text-muted-foreground/70">
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">{b.keep.map(row)}</div>
      {b.keep.length === 0 && (
        <p className="text-xs text-muted-foreground/70">Nothing worth filing — {b.drop.length} to discard.</p>
      )}
      {b.drop.length > 0 && (
        <details>
          <summary className="text-xs cursor-pointer text-muted-foreground/70">
            {b.drop.length} proposed discard{b.drop.length > 1 ? "s" : ""} (tap to review before they go)
          </summary>
          <div className="space-y-1 mt-1.5 pl-1">{b.drop.map(row)}</div>
        </details>
      )}
      <p className="text-xs text-muted-foreground/70">{b.hint}</p>
      <div className="flex items-center gap-2">
        <Input type="text" value={reply} onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder='e.g. "1 approve, 4 to idea-bank, 2 skip"'
          className="flex-1 h-auto text-xs rounded-lg px-3 py-2" />
        <Button onClick={send} disabled={sending} size="sm" className="text-xs">
          {sending ? "…" : "File"}
        </Button>
      </div>
      {feedback && <p className="text-xs text-primary">{feedback}</p>}
    </div>
  );
}

function ShipsCard({ card }: { card: BriefCard }) {
  const b = card.body as unknown as ShipsBody;
  return (
    <div className="space-y-2">
      {b.tripwire && (
        <p className="text-xs rounded-lg p-3 bg-destructive/10 text-destructive">
          Nothing has left the machine in 30 days. Building is not shipping —
          what&apos;s the smallest thing that can ship this week?
        </p>
      )}
      {b.projects.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No active projects.</p>
      ) : (
        <div className="space-y-1.5">
          {b.projects.map((p) => (
            <div key={p.title} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="text-foreground">{p.title}</span>
                {!p.shipping_event && (
                  <span className="ml-2 text-xs text-amber-500">no shipping event</span>
                )}
              </div>
              <span className={`text-xs font-mono shrink-0 ${p.days > 14 ? "text-destructive" : p.days > 7 ? "text-amber-500" : "text-muted-foreground/70"}`}>
                {p.never_shipped ? `never shipped · ${p.days}d old` : `${p.days}d since ship`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs pt-1 text-muted-foreground/70">
        {b.shipped_outward_30d} left the machine in 30 days
        {b.shipped_30d > b.shipped_outward_30d && (
          <span> · {b.shipped_30d} shipped incl. internal</span>
        )}
      </p>
    </div>
  );
}

function CardBody({ card, date }: { card: BriefCard; date: string }) {
  if (card.error) return <ErrorBody error={card.error} />;
  switch (card.type) {
    case "planning": return <PlanningCard card={card} />;
    case "triage": return <TriageCard card={card} />;
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
        <pre className="text-xs overflow-x-auto text-muted-foreground/70">
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
