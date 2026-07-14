"use client";

// Bulk action bar for the /decide approvals deck: pick one verdict, apply it to
// every pending NEEDS-SAMY card at once instead of swiping them one by one.
// A clearly-labelled control (not a bare icon) with a two-tap confirm so a
// full deck can't be cleared on a stray click, an Undo toast like the single-
// card path, and client-side batching — the id list is chunked into several
// calls so a large deck never lands as one oversized request (the bulk route
// caps ids per call and 413s otherwise).
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Layers, Loader2, MessageCircleQuestion, X } from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type { DecisionItem, DecisionVerdict } from "@/lib/decisions";

const BATCH_SIZE = 25; // stays under the bulk route's MAX_IDS_PER_CALL (50)
const CONFIRM_MS = 3500; // window before the armed confirm disarms itself

const VERDICTS: { id: DecisionVerdict; label: string; verb: string; icon: LucideIcon; tone: "danger" | "success" | "neutral" }[] = [
  { id: "approved", label: "Approve", verb: "approved", icon: Check, tone: "success" },
  { id: "rejected", label: "Reject", verb: "rejected", icon: X, tone: "danger" },
  { id: "deferred", label: "Defer", verb: "deferred", icon: Clock, tone: "neutral" },
  { id: "discuss", label: "Discuss", verb: "flagged to discuss", icon: MessageCircleQuestion, tone: "neutral" },
];

const TONE: Record<"danger" | "success" | "neutral", { bg: string; fg: string }> = {
  danger: { bg: "rgba(239,68,68,0.12)", fg: "#EF4444" },
  success: { bg: "rgba(34,197,94,0.12)", fg: "#22C55E" },
  neutral: { bg: "var(--accent-bg)", fg: "var(--accent)" },
};

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function postJSON(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { applied?: string[]; skipped?: unknown[] };
}

// Apply one verdict across many ids, chunked into several calls. Returns every
// id the server actually flipped (skips items already decided/gone).
async function applyVerdictBatched(ids: string[], verdict: DecisionVerdict): Promise<string[]> {
  const applied: string[] = [];
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const data = await postJSON("/api/decide/verdict/bulk", { ids: batch, verdict });
    applied.push(...(data.applied ?? []));
  }
  return applied;
}

interface Props {
  items: DecisionItem[];
  /** Optimistically drop these ids from the deck (fired before the network). */
  onApplied: (ids: string[]) => void;
  /** Re-pull the queue from the server to reconcile after undo or an error. */
  onRefresh: () => void | Promise<void>;
}

export function BulkApprovalBar({ items, onApplied, onRefresh }: Props) {
  const [verdictId, setVerdictId] = useState<DecisionVerdict>("approved");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const armTimer = useRef<number | null>(null);

  useEffect(() => () => { if (armTimer.current) window.clearTimeout(armTimer.current); }, []);
  // A changing deck (a single-card swipe underneath) should disarm the confirm.
  useEffect(() => { setArmed(false); }, [items.length]);

  const count = items.length;
  const verdict = VERDICTS.find((v) => v.id === verdictId)!;
  const tone = TONE[verdict.tone];

  const disarm = () => {
    setArmed(false);
    if (armTimer.current) window.clearTimeout(armTimer.current);
  };

  const undoAll = async (ids: string[]) => {
    try {
      for (const batch of chunk(ids, BATCH_SIZE)) {
        await Promise.all(batch.map((id) => postJSON("/api/decide/restore", { id })));
      }
      await onRefresh();
      toast.success("returned to the deck");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "undo failed");
      await onRefresh();
    }
  };

  const run = async () => {
    if (busy || count === 0) return;
    if (!armed) {
      setArmed(true);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(false), CONFIRM_MS);
      return;
    }
    disarm();
    setBusy(true);
    const ids = items.map((i) => i.id);
    onApplied(ids); // optimistic — the deck clears immediately
    try {
      const applied = await applyVerdictBatched(ids, verdictId);
      toast.success(`${applied.length} ${verdict.verb}`, {
        duration: 6000,
        action: applied.length
          ? { label: "Undo", onClick: () => { void undoAll(applied); } }
          : undefined,
      });
      // Reconcile in case some ids were already decided (skipped) or the deck
      // grew from a concurrent scan.
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "bulk apply failed — refresh to retry");
      await onRefresh(); // put the deck back to server truth
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-xl p-2"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <Layers size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />

      {/* Verdict selector — native <select> for accessibility + compactness. */}
      <label className="relative flex items-center">
        <span className="sr-only">Verdict to apply to all cards</span>
        <select
          value={verdictId}
          disabled={busy}
          onChange={(e) => { setVerdictId(e.target.value as DecisionVerdict); disarm(); }}
          className="appearance-none rounded-lg py-2 pl-3 pr-8 text-sm font-medium disabled:opacity-40 max-lg:[min-height:44px]"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
        >
          {VERDICTS.map((v) => (
            <option key={v.id} value={v.id}>{v.label} all</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5" style={{ color: "var(--text-tertiary)" }} />
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={run}
        aria-label={armed ? `Confirm: ${verdict.label.toLowerCase()} all ${count} cards` : `${verdict.label} all ${count} cards`}
        className="ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-transform duration-150 active:scale-[0.97] disabled:opacity-40 max-lg:[min-height:44px]"
        style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <verdict.icon size={15} />}
        {busy ? "Applying…" : armed ? `Confirm — ${verdict.label} ${count}?` : `${verdict.label} all (${count})`}
      </button>
    </div>
  );
}
