"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle, Bookmark, Calendar, CheckSquare, ChevronDown, ExternalLink,
  Link2, ShieldAlert,
} from "lucide-react";
import type {
  Brief, BriefCard, FuiteBody, TriageBody, WorkBody,
} from "@/lib/brief-types";
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
  work: <CheckSquare size={15} />,
  fuite: <ShieldAlert size={15} />,
  quorky_digest: <Link2 size={15} />,
  planning: <Calendar size={15} />,
  triage: <Bookmark size={15} />,
};

const TRIAGE_DEST_COLOR: Record<string, string> = {
  "idea-bank": "var(--chart-4)",
  vault: "var(--chart-2)",
  discard: "var(--muted-foreground)",
};
function destColor(dest: string): string {
  if (dest.startsWith("backlog")) return "var(--chart-5)";
  if (dest.startsWith("roadmap")) return "var(--warning)";
  return TRIAGE_DEST_COLOR[dest] ?? "var(--primary)";
}

/** Single-line summary shown when a state card is collapsed. */
function oneLiner(card: BriefCard): string {
  if (card.error) return "unavailable";
  switch (card.type) {
    case "fuite": {
      const n = (card.body as unknown as FuiteBody).entries?.length ?? 0;
      return n === 0 ? "no new leaks" : `${n} ${n === 1 ? "entry" : "entries"}`;
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
  const cardStateKey = `${isState}:${card.status}:${card.error ?? ""}`;
  const shouldAutoOpen = isState && (card.status !== "green" || Boolean(card.error));
  const [collapseState, setCollapseState] = useState(() => ({
    collapsed: startCollapsed,
    cardStateKey,
  }));
  let collapsed = collapseState.collapsed;
  const collapsible = isState;

  // A card that turns red/amber after first render must re-open itself —
  // adjust state from the changed card props before React commits the render.
  if (collapseState.cardStateKey !== cardStateKey) {
    collapsed = shouldAutoOpen ? false : collapseState.collapsed;
    setCollapseState({ collapsed, cardStateKey });
  }

  return (
    <Card className="gap-0 py-0 rounded-xl transition-[transform,opacity]">
      <div className="flex items-center">
        <button
          onClick={() =>
            collapsible &&
            setCollapseState((current) => ({
              ...current,
              collapsed: !current.collapsed,
            }))
          }
          disabled={!collapsible}
          aria-expanded={collapsible ? !collapsed : undefined}
          className="min-w-0 flex-1 flex items-center gap-2.5 px-4 py-3 text-left"
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
          {collapsible && (
            <ChevronDown
              size={14}
              className="ml-auto shrink-0 transition-transform text-muted-foreground/70"
              style={{ transform: collapsed ? "none" : "rotate(180deg)" }}
            />
          )}
        </button>
        {/* Sibling of the toggle, not nested inside it (<a> in <button> is
            invalid HTML); p-2 pads the tap target out to a comfortable size. */}
        {card.link && !collapsed && (
          <a
            href={card.link}
            aria-label={`Open ${card.title}`}
            target={card.link.startsWith("/") ? undefined : "_blank"}
            rel="noreferrer"
            className="shrink-0 p-2 mr-2 text-muted-foreground/70 pressable active:scale-[0.97]"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      {!collapsed && <div className="px-4 pb-4 enter">{children}</div>}
    </Card>
  );
}

function ErrorBody({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg p-3 bg-muted text-muted-foreground/70">
      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
      <span>Source unavailable — {error}</span>
    </div>
  );
}

const TODOIST_PRIORITY_COLOR: Record<number, string> = {
  4: "var(--destructive)",
  3: "var(--warning)",
  2: "var(--chart-2)",
};

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
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto p-2 -my-2 -mr-2 text-muted-foreground/70"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const FUITE_DOT_COLOR: Record<string, string> = {
  green: "var(--success)",
  orange: "var(--warning)",
  red: "var(--destructive)",
};

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
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: FUITE_DOT_COLOR[e.status] ?? "var(--muted-foreground)" }}
          />
          <span className="font-medium text-foreground">{e.org}</span>
          <span className="text-xs truncate ml-auto text-muted-foreground/70">
            {(e.data_types ?? []).join(", ")}
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
          className="block text-sm text-foreground pressable active:scale-[0.99]"
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
    return <p className="text-xs text-warning">{b.error_hint}</p>;
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
          aria-label="Adjust today's plan"
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
          style={{
            // color-mix, not a hex+"20" alpha suffix: the tokens are CSS vars,
            // and a 12% hex alpha was invisible on the dark ground anyway.
            background: `color-mix(in srgb, ${destColor(it.destination)} 20%, transparent)`,
            color: destColor(it.destination),
          }}>
          {it.destination}
        </span>
        <a href={it.url} aria-label={`Open saved source ${it.n}`} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex align-middle p-2 -m-2 text-muted-foreground/70">
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{b.keep.length + b.drop.length} saved items in this brief.</p>
        <Button asChild variant="outline" size="sm"><Link href="/decide">Open decisions</Link></Button>
      </div>
      <details className="group/snapshot">
        <summary className="flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown size={12} className="pressable group-open/snapshot:rotate-180" />Read daily snapshot
        </summary>
        <div className="space-y-3 pt-2">
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
        <Input aria-label="Triage decisions" type="text" value={reply} onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder='e.g. "1 approve, 4 to idea-bank, 2 skip"'
          className="flex-1 h-auto text-xs rounded-lg px-3 py-2" />
        <Button onClick={send} disabled={sending} size="sm" className="text-xs">
          {sending ? "…" : "File"}
        </Button>
      </div>
      {feedback && <p className="text-xs text-primary">{feedback}</p>}
        </div>
      </details>
    </div>
  );
}

function CardBody({ card }: { card: BriefCard }) {
  if (card.error) return <ErrorBody error={card.error} />;
  switch (card.type) {
    case "planning": return <PlanningCard card={card} />;
    case "triage": return <TriageCard card={card} />;
    case "work": return <WorkCard card={card} />;
    case "fuite": return <FuiteCard card={card} />;
    case "quorky_digest": return <DigestCard card={card} />;
    default:
      return (
        <p className="text-xs text-muted-foreground/70">
          Unrecognized card: {card.type}
        </p>
      );
  }
}

export function BriefCards({ brief }: { brief: Brief }) {
  // Action cards first, stable order within each group; red/amber state cards
  // surface above green ones so a bad morning is visible without scrolling.
  const severity: Record<string, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
  // ft_headlines is retired from the brief — news lives at /news (the
  // quorky_digest card links there).
  const cards = brief.cards.filter((c) => c.type !== "ft_headlines").sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "action" ? -1 : 1;
    if (a.priority === "state") return (severity[a.status] ?? 2) - (severity[b.status] ?? 2);
    return 0;
  });

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <CardShell key={card.id} card={card}>
          <CardBody card={card} />
        </CardShell>
      ))}
    </div>
  );
}
