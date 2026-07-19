"use client";

// /decide — the decision deck. Four stacks of swipeable cards sharing one
// gesture component: "Saved" (bookmark/save triage with category-specific
// assessments), "Approvals" (NEEDS-SAMY asks aggregated from every
// ROADMAP.md), "Shelf" (the one-off Firefox bookmark backfill — every
// card is a proposed drop, so right = rescue), and "Pain" (the one-off
// read-through of pulled pain points). Swipe right = approve/keep, left =
// discard/reject; buttons for the finer verdicts; voice for anything nuanced.
//
// Shelf and Pain are temporary by design: when either deck empties it stays
// empty, and the tab hides itself.
//
// Pain is the odd one out and deliberately so — no voice, and its card shows
// no assessment. Every other deck asks Samy to approve an LLM's verdict; that
// deck asks him to form the first one. See lib/pain-deck.ts.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Check, Clock, Lightbulb, ListTodo, MessageCircleQuestion, Layers, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardStack, type DeckAction } from "@/components/decide/card-stack";
import { TriageCard, type TriageQueueItem } from "@/components/decide/triage-card";
import { DecisionCard } from "@/components/decide/decision-card";
import { BookmarkCard, type BackfillDeckItem } from "@/components/decide/bookmark-card";
import { PainCard, PAIN_STACK_HEIGHT } from "@/components/decide/pain-card";
import { ProposalCard } from "@/components/decide/proposal-card";
import { BulkApprovalBar } from "@/components/decide/bulk-approval-bar";
import type { PainItem } from "@/lib/pain-deck";
import type { DecisionItem } from "@/lib/decisions";
import type { Proposal } from "@/lib/proposals";

type Deck = "saved" | "approvals" | "shelf" | "pain" | "proposals";

const TRIAGE_ACTIONS: DeckAction[] = [
  { id: "discard", label: "Discard", icon: X, direction: "left", tone: "danger" },
  { id: "vault", label: "Vault", icon: Archive, direction: "none", tone: "neutral" },
  { id: "idea-bank", label: "Idea", icon: Lightbulb, direction: "none", tone: "neutral" },
  { id: "backlog", label: "Backlog", icon: ListTodo, direction: "none", tone: "neutral" },
  { id: "approve", label: "Approve", icon: Check, direction: "right", tone: "success" },
];

// Inverted on purpose: the cull already proposed "drop" on every card here,
// so the deck's job is to catch the ones it got wrong. Right/keep is the
// rescue, and it's the success-toned action because it's the one that matters.
const BACKFILL_ACTIONS: DeckAction[] = [
  { id: "drop", label: "Drop", icon: Trash2, direction: "left", tone: "danger" },
  { id: "keep", label: "Keep", icon: Check, direction: "right", tone: "success" },
];

// Same shape as the shelf's, opposite meaning: nothing has proposed anything
// here, so "keep" is Samy's own first verdict — worth chasing, i.e. worth
// talking to that person.
const PAIN_ACTIONS: DeckAction[] = [
  { id: "drop", label: "Drop", icon: Trash2, direction: "left", tone: "danger" },
  { id: "keep", label: "Keep", icon: Check, direction: "right", tone: "success" },
];

// "Never" tombstones the tag permanently (map 11's only eligibility
// mechanism) — this is what stops `[humor]`×12 from re-proposing "learn
// humor" every night.
const PROPOSAL_ACTIONS: DeckAction[] = [
  { id: "never", label: "Never", icon: X, direction: "left", tone: "danger" },
  { id: "accept", label: "Accept", icon: Check, direction: "right", tone: "success" },
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
  const [shelf, setShelf] = useState<BackfillDeckItem[]>([]);
  const [pain, setPain] = useState<PainItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [missionDrafts, setMissionDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [t, d, s, p, pr] = await Promise.all([
      fetch("/api/triage/queue").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/decide/queue").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/triage/backfill").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/pain").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/proposals").then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    setTriage(t.items ?? []);
    setDecisions(d.items ?? []);
    setShelf(s.items ?? []);
    setPain(p.items ?? []);
    setProposals(pr.items ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const tabs: { id: Deck; label: string; count: number }[] = [
    { id: "saved", label: "Saved", count: triage.length },
    { id: "approvals", label: "Approvals", count: decisions.length },
    // The backfill is one-off: once drained, the tab stops existing rather
    // than sitting there empty forever — but it stays while he's standing on
    // it, so finishing the last card doesn't yank the tab out from under him.
    ...(shelf.length > 0 || deck === "shelf"
      ? [{ id: "shelf" as Deck, label: "Shelf", count: shelf.length }]
      : []),
    // Same one-off contract as Shelf.
    ...(pain.length > 0 || deck === "pain"
      ? [{ id: "pain" as Deck, label: "Pain", count: pain.length }]
      : []),
    ...(proposals.length > 0 || deck === "proposals"
      ? [{ id: "proposals" as Deck, label: "Proposals", count: proposals.length }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-lg">
      {/* flex-wrap: at 390px the title + deck switcher exceed the row's
          min-content width, so the switcher wraps to its own line instead of
          overflowing the viewport horizontally. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Layers size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Decide</h1>
        {/* PROTOTYPE link — adaptive workspaces for approved cards */}
        <Link href="/decide/adaptive" aria-label="Adaptive UI prototype for approved cards"
          className="rounded-lg bg-muted p-1.5 text-primary transition-transform duration-150 active:scale-[0.9]">
          <Sparkles size={16} />
        </Link>
        <div className="ml-auto flex rounded-lg bg-muted p-0.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setDeck(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-transform duration-150 active:scale-[0.97] max-lg:[min-height:44px]",
                deck === t.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}>
              {t.label}{t.count > 0 && <span className="ml-1.5 text-xs text-primary">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
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
      ) : deck === "shelf" ? (
        <CardStack
          items={shelf}
          renderCard={(item) => <BookmarkCard item={item} />}
          actions={BACKFILL_ACTIONS}
          swipeLeftId="drop"
          swipeRightId="keep"
          perform={async (item, actionId) =>
            (await post("/api/triage/backfill/verdict", { id: item.id, action: actionId })).result}
          onResolved={(item) => setShelf((xs) => xs.filter((x) => x.id !== item.id))}
          undo={async (item) => { await post("/api/triage/backfill/restore", { id: item.id }); }}
          onRestore={(item) => setShelf((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          emptyLabel="Shelf reviewed — the old bookmark backlog is cleared."
        />
      ) : deck === "pain" ? (
        <CardStack
          items={pain}
          renderCard={(item) => <PainCard item={item} />}
          actions={PAIN_ACTIONS}
          swipeLeftId="drop"
          swipeRightId="keep"
          perform={async (item, actionId) =>
            (await post("/api/pain/verdict", { id: item.id, action: actionId })).result}
          onResolved={(item) => setPain((xs) => xs.filter((x) => x.id !== item.id))}
          undo={async (item) => { await post("/api/pain/restore", { id: item.id }); }}
          onRestore={(item) => setPain((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          emptyLabel="Read through — keeps are at /api/pain?status=kept. Go talk to one of them."
          minHeight={PAIN_STACK_HEIGHT}
        />
      ) : deck === "proposals" ? (
        <CardStack
          items={proposals}
          renderCard={(item) => (
            <ProposalCard
              item={item}
              mission={missionDrafts[item.id] || ""}
              onMissionChange={(v) => setMissionDrafts((m) => ({ ...m, [item.id]: v }))}
            />
          )}
          actions={PROPOSAL_ACTIONS}
          swipeLeftId="never"
          swipeRightId="accept"
          perform={async (item, actionId) =>
            (await post("/api/proposals/verdict", {
              id: item.id,
              action: actionId,
              mission: item.kind === "topic" ? missionDrafts[item.id] : undefined,
            })).result}
          onResolved={(item) => setProposals((xs) => xs.filter((x) => x.id !== item.id))}
          emptyLabel="No tag or topic proposals right now — they surface as your saves cluster."
        />
      ) : (
        <div className="space-y-4">
          {decisions.length > 1 && (
            <BulkApprovalBar
              items={decisions}
              onApplied={(ids) => setDecisions((xs) => xs.filter((x) => !ids.includes(x.id)))}
              onRefresh={refresh}
            />
          )}
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
        </div>
      )}
    </div>
  );
}
