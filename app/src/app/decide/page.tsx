"use client";

// /decide — Samy sorting inbound material. Stacks of swipeable cards sharing
// one gesture component: "Saved" (captured items, each naming the action
// approving it commits) and "Proposals" (tag/topic proposals). Swipe right =
// approve, left = discard; "Not now" defers; voice for anything nuanced.
//
// ROADMAP approvals moved to /decide/approvals (T-decide-rework-07): an agent
// asking permission is a different interruption from sorting bookmarks, and
// the two no longer interleave in one deck.
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Clock, Inbox, Layers, RefreshCw, Terminal, X } from "lucide-react";
import { TriageBulkBar, bulkTarget } from "@/components/decide/triage-bulk-bar";
import { cn } from "@/lib/utils";
import { CardStack, type DeckAction } from "@/components/decide/card-stack";
import { TriageCard, type TriageQueueItem } from "@/components/decide/triage-card";
import { isDecidable, proposedAction, type Action } from "@/lib/decide/actions";
import { ProposalCard } from "@/components/decide/proposal-card";
import type { Proposal } from "@/lib/proposals";
import { FilterBar, Page, PageHeader } from "@/components/ui/page";

type Deck = "saved" | "proposals";

const DECKS: Deck[] = ["saved", "proposals"];

// Two gestures, because the card already names the one action approving
// commits (T-decide-rework-04). The old Vault / Idea / Backlog buttons are
// gone: they overrode the proposal with an untyped verb, and the Backlog one
// silently defaulted to the polymath centre when no centre was given.
// Choosing a different action comes back, properly typed, in ticket 06.
const TRIAGE_ACTIONS: DeckAction[] = [
  { id: "discard", label: "Discard", icon: X, direction: "left", tone: "danger" },
  { id: "defer", label: "Not now", icon: Clock, direction: "none", tone: "neutral" },
  { id: "approve", label: "Approve", icon: Check, direction: "right", tone: "success" },
];

// "Never" tombstones the tag permanently (map 11's only eligibility
// mechanism) — this is what stops `[humor]`×12 from re-proposing "learn
// humor" every night.
const PROPOSAL_ACTIONS: DeckAction[] = [
  { id: "never", label: "Never", icon: X, direction: "left", tone: "danger" },
  { id: "accept", label: "Accept", icon: Check, direction: "right", tone: "success" },
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
  // useSearchParams needs a Suspense boundary for prerendering.
  return (
    <Suspense fallback={null}>
      <DecideInner />
    </Suspense>
  );
}

function DecideInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramDeck = searchParams.get("deck");
  // Approvals moved to their own surface; old links and push payloads still
  // point at ?deck=approvals, so send them on rather than showing an empty tab.
  useEffect(() => {
    if (paramDeck === "approvals") router.replace("/decide/approvals");
  }, [paramDeck, router]);
  const [deck, setDeckState] = useState<Deck>(
    DECKS.includes(paramDeck as Deck) ? (paramDeck as Deck) : "saved",
  );
  const [triage, setTriage] = useState<TriageQueueItem[]>([]);
  // Items the study step left undecidable (no proposal, or a destination that
  // did not resolve to a real action). Withheld from the deck — a card you
  // cannot decide from the card is not a card — but counted, so they are
  // withheld rather than silently lost.
  const [withheld, setWithheld] = useState(0);
  // Samy's corrections, keyed by item id. A card with no entry commits the
  // action the study step proposed.
  const [overrides, setOverrides] = useState<Record<string, Action>>({});
  // Only the pending count, to link across without loading the other deck.
  const [approvalCount, setApprovalCount] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [missionDrafts, setMissionDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<Deck, boolean>>>({});

  // Keep the chosen deck in the URL so a refresh / shared link lands on it.
  const setDeck = useCallback((d: Deck) => {
    setDeckState(d);
    window.history.replaceState(null, "", d === "saved" ? "/decide" : `/decide?deck=${d}`);
  }, []);

  const refresh = useCallback(async () => {
    // null = the fetch itself failed; distinguish that from an empty deck so
    // a dead API never renders as a false "queue is clear".
    const get = (url: string): Promise<{ items?: unknown[] } | null> =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    const [t, d, pr] = await Promise.all([
      get("/api/triage/queue"),
      get("/api/decide/queue"),
      get("/api/proposals"),
    ]);
    setApprovalCount(d?.items?.length ?? 0);
    const triageItems = (t?.items as TriageQueueItem[]) ?? [];
    const decidable = triageItems.filter(isDecidable);
    setTriage(decidable);
    setWithheld(triageItems.length - decidable.length);
    setProposals((pr?.items as Proposal[]) ?? []);
    setErrors({ saved: t === null, proposals: pr === null });
    setLoading(false);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  // Coming back to the tab (phone-first: the app sleeps a lot) refetches, so
  // decks decided elsewhere or grown overnight are never stale.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // The action a card would commit: Samy's correction if he made one, else
  // the study step's proposal.
  const actionFor = useCallback(
    (item: TriageQueueItem): Action | null => overrides[item.id] ?? proposedAction(item),
    [overrides],
  );

  // One approval, typed: action id + its parameters, never the item's text.
  const approveOne = useCallback(async (item: TriageQueueItem, action: Action) => {
    const d = await post("/api/triage/decide", {
      id: item.id,
      action: action.id,
      params: action.params,
    });
    return d.result;
  }, []);

  const bulk = deck === "saved" ? bulkTarget(triage, actionFor) : null;

  const tabs: { id: Deck; label: string; count: number }[] = [
    { id: "saved", label: "Saved", count: triage.length },
    ...(proposals.length > 0 || deck === "proposals"
      ? [{ id: "proposals" as Deck, label: "Proposals", count: proposals.length }]
      : []),
  ];

  return (
    <Page narrow className="max-w-lg">
      <PageHeader
        kicker="Attention queue"
        title="Decide"
        description="Clear the next card. Each one names the action approving it commits."
        icon={Layers}
      />
      <FilterBar
        className="max-w-full overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {/* overflow-x-auto: keeps the switcher scrollable instead of
            overflowing the viewport on narrow phones (scrollbar hidden). */}
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setDeck(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-[color,background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] max-lg:[min-height:44px]",
                deck === t.id
                  ? "bg-surface-3 text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              {t.label}{t.count > 0 && <span className="ml-1.5 text-xs text-primary">{t.count}</span>}
            </button>
          ))}
          {/* Approvals is a separate surface, one tap away and never buried. */}
          <Link
            href="/decide/approvals"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97] max-lg:[min-height:44px]"
          >
            <Inbox size={14} aria-hidden /> Approvals
            {approvalCount > 0 && <span className="text-xs text-primary">{approvalCount}</span>}
          </Link>
          <Link
            href="/decide/dispatch"
            aria-label="Send to Claude"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97] max-lg:[min-height:44px]"
          >
            <Terminal size={14} aria-hidden />
          </Link>
      </FilterBar>

      {loading ? (
        <div className="shimmer rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          loading decks…
        </div>
      ) : errors[deck] ? (
        // A failed fetch is not an empty deck — say so and offer a retry.
        <div className="space-y-3 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load this deck.</p>
          <button onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-150 active:scale-[0.97] max-lg:[min-height:44px]">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : deck === "saved" ? (
        <>
        {bulk && (
          <TriageBulkBar
            target={bulk}
            approve={approveOne}
            onResolved={(landed) => {
              const ids = new Set(landed.map((i) => i.id));
              setTriage((xs) => xs.filter((x) => !ids.has(x.id)));
            }}
          />
        )}
        <CardStack
          items={triage}
          renderCard={(item) => (
            <TriageCard
              item={item}
              action={actionFor(item)}
              onChangeAction={(action) =>
                setOverrides((o) => ({ ...o, [item.id]: action }))}
            />
          )}
          actions={TRIAGE_ACTIONS}
          swipeLeftId="discard"
          swipeRightId="approve"
          // The request carries the action id and its typed parameters only —
          // never the item's own text. Approving commits exactly the action
          // the card named.
          perform={async (item, actionId) => {
            // "Not now" is its own verdict — no filing side effect runs.
            if (actionId === "defer") {
              return (await post("/api/triage/defer", { id: item.id })).result;
            }
            const action =
              actionId === "discard" ? ({ id: "discard", params: {} } as const) : actionFor(item);
            if (!action) throw new Error("no action proposed for this card");
            return approveOne(item, action);
          }}
          onResolved={(item) => setTriage((xs) => xs.filter((x) => x.id !== item.id))}
          undo={async (item) => { await post("/api/triage/restore", { id: item.id }); }}
          onRestore={(item) => setTriage((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          interpret={async (item, transcript) => {
            const d = await post("/api/triage/interpret", { id: item.id, transcript });
            return d.reply || d.result;
          }}
          emptyLabel="Saved queue is clear — new captures get studied nightly at 00:30. Deferred cards come back on their date."
        />
        {withheld > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {withheld} held back — no action could be proposed from the card alone.
          </p>
        )}
        </>
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
          // A topic without its mission 400s server-side — block the accept
          // up front instead of eating the card.
          guard={(item, actionId) =>
            actionId === "accept" && item.kind === "topic" && !(missionDrafts[item.id] || "").trim()
              ? "write the why first — a topic needs its mission"
              : null}
          // "Never" tombstones the tag permanently: two taps/swipes to commit.
          confirmIds={["never"]}
          perform={async (item, actionId) =>
            (await post("/api/proposals/verdict", {
              id: item.id,
              action: actionId,
              mission: item.kind === "topic" ? missionDrafts[item.id] : undefined,
            })).result}
          onResolved={(item) => setProposals((xs) => xs.filter((x) => x.id !== item.id))}
          onRestore={(item) => setProposals((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
          emptyLabel="No tag or topic proposals right now — they surface as your saves cluster."
        />
      ) : null}
    </Page>
  );
}
