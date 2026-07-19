"use client";

// PROTOTYPE — adaptive UI for approved cards. Question under test: when a
// card Samy approves in /decide opens into a workspace GENERATED from its own
// suggestion (instead of him opening the link and doing the legwork), what
// does that look like? Tap a card → it expands into its template's workspace.
// Throwaway: no persistence beyond the pre-generated specs; delete or absorb
// after the architecture conversation.
//
// Second-look actions (2026-07-12): each approved card can be discarded
// (mis-approvals) or queued as a prompt; queued prompts merge into one brief
// dispatched to a remote-controlled Claude Code session on the homelab.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ListPlus, Loader2, Send, Sparkles, Terminal, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import type { TriageQueueItem } from "@/components/decide/triage-card";
import { AdaptiveWorkspace } from "@/components/decide/adaptive-prototype/templates";
import { ExpandingWorkspace } from "@/components/decide/adaptive-prototype/expanding-card";
import { fallbackSpec, SEED_TEMPLATES, type AdaptiveSpec, type TemplateDef } from "@/lib/adaptive-prototype";

interface Row {
  item: TriageQueueItem & { filedAs?: string };
  spec: (AdaptiveSpec & { itemId?: string }) | null;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "business-idea": { label: "💰 Business idea", color: "#F59E0B" },
  "ai-tip": { label: "✨ AI tip", color: "#8B5CF6" },
  "ai-project": { label: "🛠 AI project", color: "#8B5CF6" },
  swe: { label: "⌨️ SWE", color: "var(--primary)" },
  other: { label: "Link", color: "var(--muted-foreground)" },
};

// A post whose payload is "here's a skill" gets an install-flavored prompt
// and CTA; everything else queues as a generic act-on-this brief.
function mentionsSkill(item: TriageQueueItem, spec: AdaptiveSpec): boolean {
  const p = item.proposal ?? {};
  const hay = [
    p.title, p.summary, p.assessment?.apply, spec.headline,
    ...(spec.steps ?? []).map((s) => s.text),
  ].filter(Boolean).join(" ");
  return /\bskills?\b/i.test(hay);
}

function buildPrompt(item: TriageQueueItem, spec: AdaptiveSpec): string {
  const p = item.proposal ?? {};
  const lines = [
    mentionsSkill(item, spec)
      ? "This post describes an agent skill. Find it (from the source link or by name), review what it does, and install it into ~/.agents per the agents-sync conventions so every agent sees it. If it needs adaptation to the homelab, adapt it and note what changed."
      : "Act on this approved item from my triage deck.",
    "",
    `Title: ${spec.headline ?? p.title ?? item.url}`,
    `Source: ${item.url}`,
  ];
  if (p.summary) lines.push(`Summary: ${p.summary}`);
  if (p.assessment?.apply && p.assessment.apply !== "none") {
    lines.push(`Suggested application: ${p.assessment.apply}`);
  }
  const steps = (spec.steps ?? []).map((s) => `- ${s.text}${s.detail ? ` (${s.detail})` : ""}`);
  if (steps.length > 0) lines.push("Proposed steps:", ...steps);
  return lines.join("\n");
}

export default function AdaptivePrototypePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Record<string, TemplateDef>>(
    () => Object.fromEntries(SEED_TEMPLATES.map((t) => [t.name, t])),
  );
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fromRect, setFromRect] = useState<DOMRect | null>(null);
  const [queued, setQueued] = useState<Map<string, string>>(new Map()); // itemId → queue doc id
  const [dispatching, setDispatching] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      fetch("/api/triage/adaptive").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/triage/prompt-queue").then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([a, q]) => {
      setRows(a.items ?? []);
      if (a.templates) setTemplates((seeds) => ({ ...seeds, ...a.templates }));
      setQueued(new Map(
        (q.items ?? []).map((d: { itemId: string; id: string }) => [d.itemId, d.id])
      ));
    }).finally(() => setLoading(false));
  }, []);

  const open = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    setFromRect(el ? el.getBoundingClientRect() : null);
    setOpenId(id);
  }, []);

  // Optimistic: the row leaves immediately; a failure puts it back.
  const discard = useCallback(async (row: Row) => {
    setRows((xs) => xs.filter((x) => x.item.id !== row.item.id));
    try {
      const res = await fetch("/api/triage/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.item.id, action: "discard" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("discarded", "info");
    } catch (e) {
      setRows((xs) => [row, ...xs]);
      toast(e instanceof Error ? e.message : "discard failed", "error");
    }
  }, [toast]);

  const toggleQueue = useCallback(async (row: Row, spec: AdaptiveSpec) => {
    const itemId = row.item.id;
    const existing = queued.get(itemId);
    if (existing) {
      setQueued((m) => { const n = new Map(m); n.delete(itemId); return n; });
      await fetch(`/api/triage/prompt-queue?id=${existing}`, { method: "DELETE" }).catch(() => {});
      return;
    }
    setQueued((m) => new Map(m).set(itemId, "pending"));
    try {
      const res = await fetch("/api/triage/prompt-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          title: spec.headline ?? row.item.proposal?.title ?? row.item.url,
          prompt: buildPrompt(row.item, spec),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setQueued((m) => new Map(m).set(itemId, data.id));
    } catch (e) {
      setQueued((m) => { const n = new Map(m); n.delete(itemId); return n; });
      toast(e instanceof Error ? e.message : "queue failed", "error");
    }
  }, [queued, toast]);

  // Push every un-queued approved card into the prompt queue at once, in small
  // concurrent batches so a big deck doesn't fire one giant burst of requests.
  const queueAll = useCallback(async () => {
    const pending = rows.filter((r) => !queued.has(r.item.id));
    if (pending.length === 0 || queueingAll) return;
    setQueueingAll(true);
    setQueued((m) => {
      const n = new Map(m);
      for (const r of pending) n.set(r.item.id, "pending"); // optimistic
      return n;
    });
    const BATCH = 5;
    try {
      for (let i = 0; i < pending.length; i += BATCH) {
        await Promise.all(pending.slice(i, i + BATCH).map(async (row) => {
          const spec = row.spec ?? fallbackSpec(row.item);
          const res = await fetch("/api/triage/prompt-queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: row.item.id,
              title: spec.headline ?? row.item.proposal?.title ?? row.item.url,
              prompt: buildPrompt(row.item, spec),
            }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          setQueued((m) => new Map(m).set(row.item.id, data.id));
        }));
      }
      toast(`${pending.length} card${pending.length > 1 ? "s" : ""} queued — hit Send to launch`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "queue all failed", "error");
      // Reconcile optimistic state against the server's truth.
      fetch("/api/triage/prompt-queue")
        .then((r) => r.json())
        .then((q) => setQueued(new Map((q.items ?? []).map((d: { itemId: string; id: string }) => [d.itemId, d.id]))))
        .catch(() => {});
    } finally {
      setQueueingAll(false);
    }
  }, [rows, queued, queueingAll, toast]);

  const dispatch = useCallback(async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/triage/dispatch", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setQueued(new Map());
      const sessions = data.batchCount > 1 ? ` across ${data.batchCount} sessions` : "";
      toast(`${data.itemCount} prompt(s) sent${sessions} — Claude starting on the homelab`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "dispatch failed", "error");
    } finally {
      setDispatching(false);
    }
  }, [toast]);

  const active = rows.find((r) => r.item.id === openId);
  const activeSpec: AdaptiveSpec | null = active
    ? (active.spec ?? fallbackSpec(active.item))
    : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-1 flex items-center gap-3">
        <Link href="/decide" aria-label="Back to Decide"
          className="rounded-lg bg-muted p-1.5 text-muted-foreground transition-transform duration-150 active:scale-[0.9]">
          <ArrowLeft size={18} />
        </Link>
        <Sparkles size={20} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Approved</h1>
        <Badge className="ml-auto rounded-full bg-[#F59E0B]/13 text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
          prototype
        </Badge>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Each card you approved opens into a workspace shaped by its own suggestion —
        tap one to try it. Queue cards to bundle them into one Claude session.
      </p>

      {!loading && rows.length > 1 && rows.some((r) => !queued.has(r.item.id)) && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <ListPlus size={16} className="shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Queue every approved card in one tap
          </span>
          <Button onClick={queueAll} disabled={queueingAll}
            aria-label={`Queue all ${rows.filter((r) => !queued.has(r.item.id)).length} approved cards for Claude`}
            variant="outline"
            className="ml-auto gap-1.5 border-primary bg-accent text-primary hover:bg-accent/80 max-lg:[min-height:44px]">
            {queueingAll ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
            {queueingAll ? "Queuing…" : `Queue all (${rows.filter((r) => !queued.has(r.item.id)).length})`}
          </Button>
        </div>
      )}

      {queued.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-card p-3">
          <Terminal size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">
            {queued.size} prompt{queued.size > 1 ? "s" : ""} queued
          </span>
          <Button onClick={dispatch} disabled={dispatching}
            className="ml-auto gap-1.5">
            <Send size={14} />
            {dispatching ? "sending…" : "Send to Claude"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          loading approved cards…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          Nothing approved yet — swipe right on some cards in Decide first.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const { item, spec } = row;
            const p = item.proposal ?? {};
            const resolved = spec ?? fallbackSpec(item);
            const cat = CATEGORY_META[p.category ?? "other"] ?? CATEGORY_META.other;
            const tpl = templates[resolved.template] ?? templates.file;
            const isQueued = queued.has(item.id);
            const skill = mentionsSkill(item, resolved);
            return (
              <div key={item.id}
                ref={(el) => { if (el) cardRefs.current.set(item.id, el); }}
                role="button" tabIndex={0}
                onClick={() => open(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(item.id); } }}
                className="w-full cursor-pointer rounded-xl bg-card p-4 text-left transition-transform duration-150 active:scale-[0.98]"
                style={{
                  opacity: openId === item.id ? 0.35 : 1,
                  transition: "opacity var(--dur-base) var(--ease-out-custom), transform 150ms",
                }}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium" style={{ color: cat.color }}>{cat.label}</span>
                  <Badge variant="secondary" className="ml-auto rounded text-[10px] font-medium uppercase tracking-wide">
                    {tpl.label}
                  </Badge>
                </div>
                <div className="text-sm font-semibold leading-snug text-foreground">
                  {resolved.headline ?? p.title ?? item.url}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  filed → {item.filedAs}{p.destination ? ` · ${p.destination}` : ""}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    aria-label="Discard this approved item"
                    onClick={(e) => { e.stopPropagation(); discard(row); }}
                    className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-destructive transition-transform duration-150 active:scale-[0.94]">
                    <X size={13} /> Discard
                  </button>
                  <button
                    aria-label={skill ? "Queue skill install for Claude" : "Queue prompt for Claude"}
                    onClick={(e) => { e.stopPropagation(); toggleQueue(row, resolved); }}
                    className={cn(
                      "ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-transform duration-150 active:scale-[0.94]",
                      isQueued ? "bg-primary text-primary-foreground" : "bg-muted text-primary"
                    )}>
                    {skill ? <Download size={13} /> : <Terminal size={13} />}
                    {isQueued ? "Queued ✓" : skill ? "Install skill" : "Queue for Claude"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ExpandingWorkspace open={openId !== null} fromRect={fromRect} onClose={() => setOpenId(null)}>
        {active && activeSpec && (
          <AdaptiveWorkspace
            spec={activeSpec}
            item={active.item}
            template={templates[activeSpec.template] ?? templates.file}
          />
        )}
      </ExpandingWorkspace>
    </div>
  );
}
