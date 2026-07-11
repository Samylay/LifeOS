"use client";

// /decide — the decision deck. Two stacks of swipeable cards sharing one
// gesture component: "Saved" (bookmark/save triage with category-specific
// assessments) and "Approvals" (NEEDS-SAMY asks aggregated from every
// ROADMAP.md). Swipe right = approve, left = discard/reject; buttons for the
// finer verdicts; voice for anything nuanced.
import { useCallback, useEffect, useState } from "react";
import { Archive, Check, Clock, Lightbulb, ListTodo, MessageCircleQuestion, Layers, X } from "lucide-react";
import { CardStack, type DeckAction } from "@/components/decide/card-stack";
import { TriageCard, type TriageQueueItem } from "@/components/decide/triage-card";
import { DecisionCard } from "@/components/decide/decision-card";
import type { DecisionItem } from "@/lib/decisions";

type Deck = "saved" | "approvals";

const TRIAGE_ACTIONS: DeckAction[] = [
  { id: "discard", label: "Discard", icon: X, direction: "left", tone: "danger" },
  { id: "vault", label: "Vault", icon: Archive, direction: "none", tone: "neutral" },
  { id: "idea-bank", label: "Idea", icon: Lightbulb, direction: "none", tone: "neutral" },
  { id: "backlog", label: "Backlog", icon: ListTodo, direction: "none", tone: "neutral" },
  { id: "approve", label: "Approve", icon: Check, direction: "right", tone: "success" },
];

const DECISION_ACTIONS: DeckAction[] = [
  { id: "rejected", label: "Reject", icon: X, direction: "left", tone: "danger" },
  { id: "deferred", label: "Defer", icon: Clock, direction: "none", tone: "neutral" },
  { id: "discuss", label: "Discuss", icon: MessageCircleQuestion, direction: "none", tone: "neutral" },
  { id: "approved", label: "Approve", icon: Check, direction: "right", tone: "success" },
];

async function post(url: string, body: Record<string, unknown>): Promise<Record<string, string>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function DecidePage() {
  const [deck, setDeck] = useState<Deck>("saved");
  const [triage, setTriage] = useState<TriageQueueItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [t, d] = await Promise.all([
      fetch("/api/triage/queue").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/decide/queue").then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    setTriage(t.items ?? []);
    setDecisions(d.items ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const tabs: { id: Deck; label: string; count: number }[] = [
    { id: "saved", label: "Saved", count: triage.length },
    { id: "approvals", label: "Approvals", count: decisions.length },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Layers size={24} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Decide</h1>
        <div className="ml-auto flex rounded-lg p-0.5" style={{ background: "var(--bg-tertiary)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setDeck(t.id)}
              className="rounded-md px-3 py-1.5 text-sm font-medium transition-transform duration-150 active:scale-[0.97]"
              style={{
                background: deck === t.id ? "var(--bg-secondary)" : "transparent",
                color: deck === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
                boxShadow: deck === t.id ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
              }}>
              {t.label}{t.count > 0 && <span className="ml-1.5 text-xs" style={{ color: "var(--accent)" }}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl p-10 text-center text-sm animate-pulse"
          style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
          loading decks…
        </div>
      ) : deck === "saved" ? (
        <CardStack
          items={triage}
          renderCard={(item) => <TriageCard item={item} />}
          actions={TRIAGE_ACTIONS}
          swipeLeftId="discard"
          swipeRightId="approve"
          perform={async (item, actionId) =>
            (await post("/api/triage/decide", { id: item.id, action: actionId })).result}
          onResolved={(item) => setTriage((xs) => xs.filter((x) => x.id !== item.id))}
          undo={async (item) => { await post("/api/triage/restore", { id: item.id }); }}
          onRestore={(item) => setTriage((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          interpret={async (item, transcript) => {
            const d = await post("/api/triage/interpret", { id: item.id, transcript });
            return d.reply || d.result;
          }}
          emptyLabel="Saved queue is clear — new captures get studied nightly at 00:30."
        />
      ) : (
        <CardStack
          items={decisions}
          renderCard={(item) => <DecisionCard item={item} />}
          actions={DECISION_ACTIONS}
          swipeLeftId="rejected"
          swipeRightId="approved"
          perform={async (item, actionId) =>
            (await post("/api/decide/verdict", { id: item.id, verdict: actionId })).result}
          onResolved={(item) => setDecisions((xs) => xs.filter((x) => x.id !== item.id))}
          undo={async (item) => { await post("/api/decide/restore", { id: item.id }); }}
          onRestore={(item) => setDecisions((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          interpret={async (item, transcript) => {
            const d = await post("/api/decide/interpret", { id: item.id, transcript });
            return d.reply || d.result;
          }}
          emptyLabel="Nothing needs your call — NEEDS-SAMY asks land here on the nightly scan."
        />
      )}
    </div>
  );
}
