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
import { ArrowLeft, Download, Send, Sparkles, Terminal, X } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import type { TriageQueueItem } from "@/components/decide/triage-card";
import { AdaptiveWorkspace } from "@/components/decide/adaptive-prototype/templates";
import { ExpandingWorkspace } from "@/components/decide/adaptive-prototype/expanding-card";
import { fallbackSpec, TEMPLATE_REGISTRY, type AdaptiveSpec } from "@/lib/adaptive-prototype";

interface Row {
  item: TriageQueueItem & { filedAs?: string };
  spec: (AdaptiveSpec & { itemId?: string }) | null;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "business-idea": { label: "💰 Business idea", color: "#F59E0B" },
  "ai-tip": { label: "✨ AI tip", color: "#8B5CF6" },
  "ai-project": { label: "🛠 AI project", color: "#8B5CF6" },
  swe: { label: "⌨️ SWE", color: "var(--accent)" },
  other: { label: "Link", color: "var(--text-tertiary)" },
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
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fromRect, setFromRect] = useState<DOMRect | null>(null);
  const [queued, setQueued] = useState<Map<string, string>>(new Map()); // itemId → queue doc id
  const [dispatching, setDispatching] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      fetch("/api/triage/adaptive").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/triage/prompt-queue").then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([a, q]) => {
      setRows(a.items ?? []);
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

  const dispatch = useCallback(async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/triage/dispatch", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setQueued(new Map());
      toast(`${data.itemCount} prompt(s) sent — Claude session starting on the homelab`, "success");
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
          className="rounded-lg p-1.5 transition-transform duration-150 active:scale-[0.9]"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          <ArrowLeft size={18} />
        </Link>
        <Sparkles size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Approved</h1>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "#F59E0B22", color: "#F59E0B" }}>
          prototype
        </span>
      </div>
      <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Each card you approved opens into a workspace shaped by its own suggestion —
        tap one to try it. Queue cards to bundle them into one Claude session.
      </p>

      {queued.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl p-3"
          style={{ background: "var(--bg-secondary)" }}>
          <Terminal size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {queued.size} prompt{queued.size > 1 ? "s" : ""} queued
          </span>
          <button onClick={dispatch} disabled={dispatching}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-transform duration-150 active:scale-[0.97]"
            style={{
              background: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: dispatching ? 0.6 : 1,
            }}>
            <Send size={14} />
            {dispatching ? "sending…" : "Send to Claude"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-xl p-10 text-center text-sm"
          style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
          loading approved cards…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl p-10 text-center text-sm"
          style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
          Nothing approved yet — swipe right on some cards in Decide first.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const { item, spec } = row;
            const p = item.proposal ?? {};
            const resolved = spec ?? fallbackSpec(item);
            const cat = CATEGORY_META[p.category ?? "other"] ?? CATEGORY_META.other;
            const tpl = TEMPLATE_REGISTRY[resolved.template] ?? TEMPLATE_REGISTRY.file;
            const isQueued = queued.has(item.id);
            const skill = mentionsSkill(item, resolved);
            return (
              <div key={item.id}
                ref={(el) => { if (el) cardRefs.current.set(item.id, el); }}
                role="button" tabIndex={0}
                onClick={() => open(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(item.id); } }}
                className="w-full cursor-pointer rounded-xl p-4 text-left transition-transform duration-150 active:scale-[0.98]"
                style={{
                  background: "var(--bg-secondary)",
                  opacity: openId === item.id ? 0.35 : 1,
                  transition: "opacity var(--dur-base) var(--ease-out-custom), transform 150ms",
                }}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium" style={{ color: cat.color }}>{cat.label}</span>
                  <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                    {tpl.label}
                  </span>
                </div>
                <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                  {resolved.headline ?? p.title ?? item.url}
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                  filed → {item.filedAs}{p.destination ? ` · ${p.destination}` : ""}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    aria-label="Discard this approved item"
                    onClick={(e) => { e.stopPropagation(); discard(row); }}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-transform duration-150 active:scale-[0.94]"
                    style={{ background: "var(--bg-tertiary)", color: "#EF4444" }}>
                    <X size={13} /> Discard
                  </button>
                  <button
                    aria-label={skill ? "Queue skill install for Claude" : "Queue prompt for Claude"}
                    onClick={(e) => { e.stopPropagation(); toggleQueue(row, resolved); }}
                    className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-transform duration-150 active:scale-[0.94]"
                    style={{
                      background: isQueued ? "var(--accent)" : "var(--bg-tertiary)",
                      color: isQueued ? "var(--bg-primary)" : "var(--accent)",
                    }}>
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
        {active && activeSpec && <AdaptiveWorkspace spec={activeSpec} item={active.item} />}
      </ExpandingWorkspace>
    </div>
  );
}
