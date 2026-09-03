"use client";

// /decide/approvals — NEEDS-USER asks aggregated from every ROADMAP.md, on
// their own surface (T-decide-rework-07). An agent asking permission and Samy
// sorting inbound bookmarks are different interruptions, so they no longer
// interleave in one deck.
//
// The flow itself is unchanged: same DecisionItem model, same four verdicts,
// same host-side ROADMAP write-back. This moved the surface, not the
// mechanism — it is the part of /decide that already works.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, MessageCircleQuestion, Inbox, RefreshCw, X } from "lucide-react";
import { CardStack, type DeckAction } from "@/components/decide/card-stack";
import { DecisionCard } from "@/components/decide/decision-card";
import { BulkApprovalBar } from "@/components/decide/bulk-approval-bar";
import type { DecisionItem } from "@/lib/decisions";
import { Page, PageHeader } from "@/components/ui/page";
import { post } from "@/lib/decide/post";

const DECISION_ACTIONS: DeckAction[] = [
  { id: "rejected", label: "Reject", icon: X, direction: "left", tone: "danger" },
  { id: "deferred", label: "Defer", icon: Clock, direction: "none", tone: "neutral" },
  { id: "discuss", label: "Discuss", icon: MessageCircleQuestion, direction: "none", tone: "neutral" },
  { id: "approved", label: "Approve", icon: Check, direction: "right", tone: "success" },
];

export default function ApprovalsPage() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  // null = the fetch itself failed; a dead API must never render as a false
  // "nothing needs your call".
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const d = await fetch("/api/decide/queue")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setDecisions((d?.items as DecisionItem[]) ?? []);
    setFailed(d === null);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  // Coming back to the tab (phone-first: the app sleeps a lot) refetches, so
  // asks answered elsewhere or raised overnight are never stale.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  return (
    <Page narrow className="max-w-lg">
      <PageHeader
        kicker="Agents asking permission"
        title="Approvals"
        description="NEEDS-USER asks from every ROADMAP. Your verdict is written back to the project."
        icon={Inbox}
      />
      <Link
        href="/decide"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"
      >
        ← Saved items
      </Link>

      {loading ? (
        <div className="shimmer rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          loading approvals…
        </div>
      ) : failed ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load approvals.</p>
          <button onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] max-lg:[min-height:44px]">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
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
              String((await post("/api/decide/verdict", { id: item.id, verdict: actionId })).result ?? "")}
            onResolved={(item) => setDecisions((xs) => xs.filter((x) => x.id !== item.id))}
            undo={async (item) => { await post("/api/decide/restore", { id: item.id }); }}
            onRestore={(item) => setDecisions((xs) => [item, ...xs.filter((x) => x.id !== item.id)])}
            interpret={async (item, transcript) => {
              const d = await post("/api/decide/interpret", { id: item.id, transcript });
              return String(d.reply || d.result || "");
            }}
            emptyLabel="Nothing needs your call — NEEDS-USER asks land here on the nightly scan."
          />
        </div>
      )}
    </Page>
  );
}
