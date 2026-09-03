"use client";

// T-decide-rework-06 — when a run of cards all propose the same action, clear
// them in one gesture. Each card is approved through the same typed endpoint
// as a single swipe, so each reports its own outcome and one failure leaves
// the rest of that batch untouched rather than silently marking them handled.
import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { actionKey, actionLabel, type Action } from "@/lib/decide/actions";

export interface BulkTarget<T> {
  action: Action;
  items: T[];
}

// The cards sharing the top card's action, so a bulk gesture only ever clears
// a run Samy is already looking at — never the whole queue at once.
export function bulkTarget<T extends { id: string }>(
  items: T[],
  actionFor: (item: T) => Action | null,
): BulkTarget<T> | null {
  const top = items[0] ? actionFor(items[0]) : null;
  if (!top) return null;
  const key = actionKey(top);
  const matching = items.filter((i) => {
    const a = actionFor(i);
    return a !== null && actionKey(a) === key;
  });
  return matching.length > 1 ? { action: top, items: matching } : null;
}

export function TriageBulkBar<T extends { id: string }>({
  target,
  approve,
  onResolved,
}: {
  target: BulkTarget<T>;
  /** Approve one item; resolves to its own outcome, rejects on failure. */
  approve: (item: T, action: Action) => Promise<string>;
  /** Remove the items that actually landed. */
  onResolved: (items: T[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const results = await Promise.allSettled(
      target.items.map((item) => approve(item, target.action)),
    );
    const landed = target.items.filter((_, i) => results[i].status === "fulfilled");
    const failed = results.length - landed.length;
    onResolved(landed);
    setBusy(false);

    if (landed.length > 0) toast.success(`${landed.length} × ${actionLabel(target.action)}`);
    if (failed > 0) {
      // Say which ones did not land — the whole point is that a failure
      // inside a batch cannot masquerade as work done.
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      const why = first?.reason instanceof Error ? first.reason.message : "action failed";
      toast.error(`${failed} stayed in the deck — ${why}`);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40 max-lg:[min-height:44px]"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
      Approve all {target.items.length} → {actionLabel(target.action)}
    </button>
  );
}
