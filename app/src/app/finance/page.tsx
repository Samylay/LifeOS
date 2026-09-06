"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  Plus,
  Trash2,
  ClipboardPaste,
  Check,
  X,
  MoonStar,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  AlertTriangle,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Sparkles,
  Pencil,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useFinance } from "@/lib/use-finance";
import { useBankAccounts } from "@/lib/use-bank-accounts";
import { useFinanceBurn, type FinanceBurnOverview } from "@/lib/use-finance-burn";
import type { MonthlyBurnResult } from "@/lib/finance-burn";
import type { CancellableGroup, RecurringChargeView } from "@/lib/finance-overview";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Page, PageHeader } from "@/components/ui/page";
import {
  CADENCE_LABEL,
  KIND_LABEL,
  formatEuro,
  monthlyAmount,
  parseFlowList,
  yearlyAmount,
  type FinanceFlow,
  type FinanceFlowDraft,
  type FlowCadence,
  type FlowKind,
} from "@/lib/finance";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { KpiCard, CategoryBar } from "@/components/charts";

// A placeholder, so the box is never a blank wall. Invented round numbers and
// generic labels on purpose: this repo's remote is public, and a realistic
// example reads as a real budget to anyone who finds it. Nothing here is
// written until he presses the button.
const PASTE_PLACEHOLDER = `# rentrées
Bourse +000 /mois
Salaire +000 /mois

# sorties
Loyer 000 /mois
Salle de sport 00 /mois
Forfait mobile 00 /mois
Courses 000 /mois
Un abonnement oublié 00 /an inutilisé`;

const KIND_TABS: { kind: FlowKind; label: string; hint: string }[] = [
  { kind: "fixed", label: "Fixed", hint: "Hard to cancel this month" },
  { kind: "sub", label: "Subs", hint: "Cancellable" },
  { kind: "variable", label: "Variable", hint: "Discretionary" },
];

const CADENCES: FlowCadence[] = ["monthly", "weekly", "quarterly", "yearly", "oneoff"];

/** Segmented pill. Press feedback per house doctrine; colors only, no layout. */
const pillClass = (active: boolean) =>
  cn(
    "pressable rounded-full px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-fast)] active:scale-[0.97]",
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
  );

function PasteBox({
  onImport,
  onCancel,
}: {
  onImport: (drafts: FinanceFlowDraft[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseFlowList(text), [text]);
  const good = parsed.filter((p) => p.flow).map((p) => p.flow as FinanceFlowDraft);
  const bad = parsed.filter((p) => !p.flow);

  return (
    <Card className="enter gap-3 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">Paste your rentrées / sorties</p>
        <p className="mt-1 text-xs text-muted-foreground">
          One per line. A leading <code className="rounded bg-muted px-1">+</code> means money in, everything else is
          money out. <code className="rounded bg-muted px-1">/mois</code>, <code className="rounded bg-muted px-1">/an</code>{" "}
          and <code className="rounded bg-muted px-1">inutilisé</code> are understood.
        </p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PASTE_PLACEHOLDER}
        rows={10}
        className="font-mono text-sm"
        autoFocus
      />

      {good.length > 0 && (
        <div className="space-y-1">
          {good.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-foreground">
                {f.direction === "in" ? "+" : "−"} {f.label}
                {f.dormant && <span className="ml-1 text-muted-foreground">(unused)</span>}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatEuro(f.amount)} {CADENCE_LABEL[f.cadence]}
              </span>
            </div>
          ))}
          {good.length > 6 && (
            <p className="text-xs text-muted-foreground">and {good.length - 6} more</p>
          )}
        </div>
      )}

      {bad.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle size={13} /> {bad.length} line{bad.length > 1 ? "s" : ""} skipped, add an amount
          </p>
          {bad.slice(0, 3).map((p, i) => (
            <p key={i} className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {p.raw}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={good.length === 0} onClick={() => onImport(good)} className="gap-1.5">
          <Check size={15} /> Add {good.length || ""} row{good.length === 1 ? "" : "s"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1.5">
          <X size={15} /> Cancel
        </Button>
      </div>
    </Card>
  );
}

function QuickAdd({ onAdd, onCancel }: { onAdd: (d: FinanceFlowDraft) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [cadence, setCadence] = useState<FlowCadence>("monthly");
  const [kind, setKind] = useState<FlowKind>("sub");

  const value = Number(amount.replace(",", "."));
  const valid = label.trim() !== "" && Number.isFinite(value) && value > 0;

  return (
    <Card className="enter gap-3 px-4 py-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is it?"
          className="h-9 min-w-[10rem] flex-1 text-sm"
          autoFocus
        />
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          className="h-9 w-24 text-sm tabular-nums"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["out", "in"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={pillClass(direction === d)}
          >
            {d === "out" ? "Sortie" : "Rentrée"}
          </button>
        ))}
        <span className="w-px bg-border" />
        {CADENCES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCadence(c)}
            className={pillClass(cadence === c)}
          >
            {CADENCE_LABEL[c]}
          </button>
        ))}
      </div>

      {direction === "out" && (
        <div className="flex flex-wrap gap-1.5">
          {KIND_TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => setKind(t.kind)}
              title={t.hint}
              className={pillClass(kind === t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!valid}
          className="gap-1.5"
          onClick={() =>
            onAdd({
              label: label.trim(),
              amount: value,
              direction,
              cadence,
              kind: direction === "in" ? "fixed" : kind,
            })
          }
        >
          <Check size={15} /> Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1.5">
          <X size={15} /> Cancel
        </Button>
      </div>
    </Card>
  );
}

function FlowRow({
  flow,
  onToggleDormant,
  onDelete,
}: {
  flow: FinanceFlow;
  onToggleDormant?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {flow.label}
          {flow.dormant && (
            <Badge variant="outline" className="ml-2 gap-1 text-[10px] font-medium">
              <MoonStar size={10} /> unused
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatEuro(flow.amount)} {CADENCE_LABEL[flow.cadence]}
          {flow.cadence !== "monthly" && flow.cadence !== "oneoff" && (
            <span> · {formatEuro(monthlyAmount(flow))} a month</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="tabular-nums text-sm text-muted-foreground">
          {flow.cadence === "oneoff" ? "—" : `${formatEuro(yearlyAmount(flow), { decimals: false })}/yr`}
        </span>
        {onToggleDormant && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleDormant}
            title={flow.dormant ? "Mark as used" : "Mark as unused"}
            className={flow.dormant ? "text-primary" : "text-muted-foreground"}
          >
            <MoonStar size={15} />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-muted-foreground" title="Delete">
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", { month: "short" });
}

function formatSyncedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Stale-sync and consent-expiry banners (ticket 02): a surface showing
 * months-old numbers as current is the failure this rework exists to
 * prevent, so this renders above every number rather than being inferred.
 */
function BurnBanner({ overview }: { overview: FinanceBurnOverview }) {
  if (!overview.stale && overview.consentWarnings.length === 0) return null;
  return (
    <div className="enter flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
      {overview.stale && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
          <AlertTriangle size={14} className="shrink-0" />
          Data may be out of date — {overview.lastSyncedLabel.toLowerCase()}.
        </p>
      )}
      {overview.consentWarnings.map((w) => {
        const days = Math.ceil(w.daysRemaining);
        return (
          <p key={w.sessionId} className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle size={14} className="shrink-0" />
            {w.aspspName ?? "A linked bank"} consent {days <= 0 ? "has expired" : `expires in ${days} day${days === 1 ? "" : "s"}`}.
          </p>
        );
      })}
    </div>
  );
}

/** Six-month burn-out comparison, oldest to current, so a rise or fall reads
 * at a glance rather than requiring him to read a statement. */
function MonthHistory({ months }: { months: MonthlyBurnResult[] }) {
  const maxOut = Math.max(...months.map((m) => m.burn.out), 1);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {months.map((m, i) => {
        const isCurrent = i === months.length - 1;
        const heightPx = m.burn.out > 0 ? Math.max(4, (m.burn.out / maxOut) * 64) : 2;
        return (
          <div key={m.burn.month} className="flex min-w-[3.25rem] flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end justify-center" title={formatEuro(m.burn.out)}>
              <div
                className={cn("w-6 rounded-t-sm", isCurrent ? "bg-primary" : "bg-muted")}
                style={{ height: `${heightPx}px` }}
              />
            </div>
            <span
              className={cn(
                "text-[10px] tabular-nums",
                isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {formatMonthLabel(m.burn.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatChargeDate(date: string): string {
  // bookingDate is a plain YYYY-MM-DD; pin it to UTC midnight so a reader in
  // any timezone sees the same day the bank recorded, never one shifted by
  // the browser's local offset.
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const KIND_ORDER: FlowKind[] = ["fixed", "sub", "variable"];

/**
 * The correction gesture (ticket 04): pick one of the three classifications
 * from a menu, no typing, keyed to the charge's normalized counterparty —
 * never a transaction. Rare by design (the detector gets this right in the
 * overwhelming majority of cases now — see spec.md), so it's a small pencil
 * affordance next to the amount rather than a permanent control on every
 * row. An already-overridden charge gets an extra "Reset to detected" item
 * that clears the correction outright.
 */
function CorrectChargeMenu({
  charge,
  onCorrect,
  onClear,
}: {
  charge: RecurringChargeView;
  onCorrect: (kind: FlowKind) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Correct classification for ${charge.label}`}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          <Pencil size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {KIND_ORDER.map((kind) => (
          <DropdownMenuItem key={kind} disabled={kind === charge.kind} onSelect={() => onCorrect(kind)}>
            {kind === charge.kind && <Check size={14} />}
            {KIND_LABEL[kind]}
          </DropdownMenuItem>
        ))}
        {charge.overridden && (
          <DropdownMenuItem onSelect={onClear}>
            <Undo2 size={14} />
            Reset to detected
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One detected recurring charge (ticket 03): what it is called, how often it
 * hits, what it typically costs, when it started and when it last hit —
 * "enough to recognise it without opening his bank" (spec.md), deliberately
 * never the 0.6–0.95 confidence number finance-burn.ts computes. That figure
 * is a rough proxy for "how many occurrences confirmed the cadence" and
 * would read as more authoritative than it is; occurrence count + first/last
 * date give Samy the same signal in a form he can actually judge.
 *
 * `onCorrect`/`onClear` are optional so this row still renders in a context
 * with no override plumbing (tests, a future read-only view).
 */
function RecurringChargeRow({
  charge,
  onCorrect,
  onClear,
}: {
  charge: RecurringChargeView;
  onCorrect?: (merchantKey: string, kind: FlowKind) => void;
  onClear?: (merchantKey: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
          <span className="truncate">{charge.label}</span>
          {charge.isNew && (
            <Badge className="shrink-0 gap-1 text-[10px] font-medium">
              <Sparkles size={10} /> New
            </Badge>
          )}
          {charge.overridden && (
            <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
              Corrected
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {CADENCE_LABEL[charge.cadence]} · seen {charge.occurrenceCount}× · {formatChargeDate(charge.firstSeen)} –{" "}
          {formatChargeDate(charge.lastSeen)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-sm text-muted-foreground">{formatEuro(charge.amount)}</span>
        {onCorrect && onClear && (
          <CorrectChargeMenu
            charge={charge}
            onCorrect={(kind) => onCorrect(charge.merchantKey, kind)}
            onClear={() => onClear(charge.merchantKey)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Cancellable subscriptions called out on their own (ticket 03): "what could
 * I stop paying for", dearest first, with the yearly total stated because a
 * monthly figure understates what a subscription actually costs.
 */
function CancellableCard({
  group,
  onCorrect,
  onClear,
}: {
  group: CancellableGroup;
  onCorrect: (merchantKey: string, kind: FlowKind) => void;
  onClear: (merchantKey: string) => void;
}) {
  if (group.charges.length === 0) return null;
  return (
    <Card className="enter gap-2 px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="section-label">Cancellable</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatEuro(group.yearlyTotal, { decimals: false })} a year
        </p>
      </div>
      <div>
        {group.charges.map((c) => (
          <RecurringChargeRow key={c.merchantKey} charge={c} onCorrect={onCorrect} onClear={onClear} />
        ))}
      </div>
    </Card>
  );
}

/**
 * Every recurring charge the system found (ticket 03) — the full list Samy
 * sanity-checks the fixed/sub split against, not just the cancellable ones.
 */
function RecurringChargesCard({
  charges,
  onCorrect,
  onClear,
}: {
  charges: RecurringChargeView[];
  onCorrect: (merchantKey: string, kind: FlowKind) => void;
  onClear: (merchantKey: string) => void;
}) {
  if (charges.length === 0) return null;
  return (
    <Card className="enter gap-2 px-4 py-4">
      <p className="section-label">Recurring charges</p>
      <div>
        {charges.map((c) => (
          <RecurringChargeRow key={c.merchantKey} charge={c} onCorrect={onCorrect} onClear={onClear} />
        ))}
      </div>
    </Card>
  );
}

/**
 * The derived-burn surface (ticket 02): the first thing on screen. Every
 * number here comes from synced transactions via finance-overview.ts / the
 * pure finance-burn.ts module — nothing here asks Samy to type anything.
 */
function BurnOverview() {
  const { overview, loading, correctCharge, clearCorrection } = useFinanceBurn();
  const { toast } = useToast();

  const handleCorrect = async (merchantKey: string, kind: FlowKind) => {
    try {
      await correctCharge(merchantKey, kind);
      toast(`Moved to ${KIND_LABEL[kind]}`, "success");
    } catch {
      toast("Couldn't save the correction", "error");
    }
  };

  const handleClear = async (merchantKey: string) => {
    try {
      await clearCorrection(merchantKey);
      toast("Back to detected classification", "success");
    } catch {
      toast("Couldn't clear the correction", "error");
    }
  };

  if (loading && !overview) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!overview || overview.months.length === 0) return null;

  const months = overview.months;
  const current = months[months.length - 1];
  const previous = months.length > 1 ? months[months.length - 2] : null;
  const deltaPct =
    previous && previous.burn.out > 0
      ? Math.round(((current.burn.out - previous.burn.out) / previous.burn.out) * 100)
      : null;

  return (
    <div className="space-y-3">
      <BurnBanner overview={overview} />

      <Card className="enter gap-3 px-4 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="section-label">This month&rsquo;s burn</p>
          <span className="text-xs text-muted-foreground">{overview.lastSyncedLabel}</span>
        </div>

        <div className={cn("grid grid-cols-2 gap-3", current.burn.transfer > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
          <KpiCard
            label="Spend"
            value={formatEuro(current.burn.out, { decimals: false })}
            icon={<TrendingDown size={13} />}
            delta={
              deltaPct !== null
                ? { value: `${Math.abs(deltaPct)}%`, direction: deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat" }
                : undefined
            }
          />
          <KpiCard label="Fixed" value={formatEuro(current.burn.fixed, { decimals: false })} icon={<Landmark size={13} />} />
          <KpiCard label="Subs" value={formatEuro(current.burn.sub, { decimals: false })} icon={<PiggyBank size={13} />} />
          <KpiCard label="Variable" value={formatEuro(current.burn.variable, { decimals: false })} icon={<Wallet size={13} />} />
          {current.burn.transfer > 0 && (
            <KpiCard label="Transfers" value={formatEuro(current.burn.transfer, { decimals: false })} icon={<ArrowLeftRight size={13} />} />
          )}
        </div>
        {current.burn.transfer > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatEuro(current.burn.transfer, { decimals: false })} moved between your own accounts this month — not
            counted as spend.
          </p>
        )}

        <MonthHistory months={months} />
      </Card>

      {overview.accounts.length > 0 && (
        <Card className="enter gap-2 px-4 py-4">
          <p className="section-label">Accounts</p>
          <div>
            {overview.accounts.map((a) => (
              <div
                key={a.accountUid}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{a.aspspName ?? "Bank"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.balanceSyncedAt ? `Balance as of ${formatSyncedDate(a.balanceSyncedAt)}` : "No balance synced yet"}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-medium text-foreground">
                  {a.balanceAmount ? formatEuro(Number(a.balanceAmount)) : "—"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <CancellableCard group={overview.cancellable} onCorrect={handleCorrect} onClear={handleClear} />
      <RecurringChargesCard charges={overview.recurringCharges} onCorrect={handleCorrect} onClear={handleClear} />
    </div>
  );
}

/**
 * The bank-fed half (T71): only the bank's *content* lives here now — recent
 * synced activity, kept visibly separate from the hand-kept flows above per
 * T83's D4 boundary (this never merges into `financeFlows`). Connecting a bank
 * and syncing moved to Settings, next to the other integrations.
 */
function RecentBankActivity() {
  const { accounts, recentTransactions, loading } = useBankAccounts();

  if (loading && recentTransactions.length === 0) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (recentTransactions.length === 0) {
    return (
      <Card className="enter gap-2 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Landmark size={15} className="text-muted-foreground" /> Bank activity
        </p>
        <p className="text-sm text-muted-foreground">
          {accounts.length === 0 ? (
            <>
              No bank connected yet — the numbers above stay hand-kept.{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Connect one in Settings
              </Link>
              .
            </>
          ) : (
            "Connected, but nothing synced yet."
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card className="enter gap-2 px-4 py-4">
      <p className="section-label">Recent bank activity</p>
      <div>
        {recentTransactions.map((t) => {
          const amount = Number(t.amount);
          const isIn = amount >= 0;
          return (
            <div
              key={t.transactionId}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                {isIn ? (
                  <ArrowDownLeft size={14} className="shrink-0 text-primary" />
                ) : (
                  <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
                )}
                <p className="truncate text-sm text-foreground">{t.creditorName ?? t.debtorName ?? "Unlabelled"}</p>
                <Badge variant="outline" className="shrink-0 text-[10px] font-medium text-muted-foreground">
                  synced
                </Badge>
              </div>
              <span className="shrink-0 tabular-nums text-sm text-muted-foreground">{formatEuro(amount)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function FinancePage() {
  const {
    flows,
    loading,
    totals,
    subs,
    spend,
    habits,
    income,
    outgoings,
    addFlow,
    addFlows,
    updateFlow,
    deleteFlow,
  } = useFinance();
  const { toast } = useToast();
  const [mode, setMode] = useState<"none" | "paste" | "quick">("none");
  const [pendingDelete, setPendingDelete] = useState<FinanceFlow | null>(null);

  const subsYearly = subs.reduce((sum, f) => sum + yearlyAmount(f), 0);
  const empty = flows.length === 0 && !loading;

  return (
    <Page>
      <PageHeader
        kicker="Money"
        title="Finance"
        description="Rentrées, sorties, and the recurring costs that deserve a decision."
        icon={Wallet}
        actions={mode === "none" && !empty ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setMode("paste")} className="gap-1.5 text-sm">
              <ClipboardPaste size={15} /> Paste list
            </Button>
            <Button size="sm" onClick={() => setMode("quick")} className="gap-1.5 text-sm">
              <Plus size={15} /> Add
            </Button>
          </>
        ) : undefined}
      />

      <BurnOverview />

      {mode === "paste" && (
        <PasteBox
          onCancel={() => setMode("none")}
          onImport={async (drafts) => {
            setMode("none");
            await addFlows(drafts);
            toast(`${drafts.length} row${drafts.length === 1 ? "" : "s"} added`);
          }}
        />
      )}

      {mode === "quick" && (
        <QuickAdd
          onCancel={() => setMode("none")}
          onAdd={async (draft) => {
            setMode("none");
            await addFlow(draft);
            toast("Added");
          }}
        />
      )}

      {loading && flows.length === 0 && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {empty && mode === "none" && (
        <Card className="flex-col items-center justify-center py-16 text-center">
          <Wallet size={48} className="mb-4 text-muted-foreground/70" />
          <p className="text-lg font-medium text-foreground">Nothing tracked yet</p>
          <p className="mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Paste your rentrées / sorties list. It takes one go, and the subscriptions and habits below build
            themselves from it.
          </p>
          <Button size="sm" onClick={() => setMode("paste")} className="gap-1.5 text-sm">
            <ClipboardPaste size={15} /> Paste list
          </Button>
        </Card>
      )}

      {flows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 enter">
          <KpiCard label="In" value={formatEuro(totals.monthlyIn, { decimals: false })} icon={<TrendingUp size={13} />} />
          <KpiCard label="Out" value={formatEuro(totals.monthlyOut, { decimals: false })} icon={<TrendingDown size={13} />} />
          <KpiCard
            label="Left over"
            value={formatEuro(totals.monthlyLeft, { decimals: false })}
            icon={<PiggyBank size={13} />}
            className={totals.monthlyLeft < 0 ? "border-destructive/50" : undefined}
          />
        </div>
      )}

      <RecentBankActivity />

      {flows.length > 0 && (
        <>
          {/* Habits: behaviour, not a ledger. */}
          {habits.length > 0 && (
            <Card className="gap-2 px-4 py-4">
              <p className="section-label">Where it goes</p>
              {spend.length > 0 && (
                <CategoryBar
                  data={spend.map((s) => ({ label: s.label, value: s.monthly }))}
                  showLegend
                  valueFormatter={(v) => formatEuro(v, { decimals: false })}
                />
              )}
              <ul className="mt-1 space-y-1">
                {habits.map((line) => (
                  <li key={line} className="text-sm text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Subscriptions: the list he is meant to prune. */}
          <Card className="gap-2 px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="section-label">Subscriptions</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatEuro(totals.monthlySubs)} a month · {formatEuro(subsYearly, { decimals: false })} a year
              </p>
            </div>
            {totals.dormantYearly > 0 && (
              <p className="text-xs text-destructive">
                {formatEuro(totals.dormantYearly, { decimals: false })} a year of that is marked unused.
              </p>
            )}
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cancellable subscriptions tracked.</p>
            ) : (
              <div>
                {subs.map((f) => (
                  <FlowRow
                    key={f.id}
                    flow={f}
                    onToggleDormant={() => updateFlow(f.id, { dormant: !f.dormant })}
                    onDelete={() => setPendingDelete(f)}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* The raw list, last — it is reference, not the point. */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="gap-2 px-4 py-4">
              <p className="section-label">Rentrées</p>
              {income.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing coming in is tracked.</p>
              ) : (
                <div>
                  {income.map((f) => (
                    <FlowRow key={f.id} flow={f} onDelete={() => setPendingDelete(f)} />
                  ))}
                </div>
              )}
            </Card>
            <Card className="gap-2 px-4 py-4">
              <p className="text-sm font-medium text-foreground">Sorties</p>
              <div>
                {outgoings.map((f) => (
                  <FlowRow
                    key={f.id}
                    flow={f}
                    onToggleDormant={f.kind === "sub" ? () => updateFlow(f.id, { dormant: !f.dormant }) : undefined}
                    onDelete={() => setPendingDelete(f)}
                  />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this line?"
        message={pendingDelete ? `${pendingDelete.label}, ${formatEuro(pendingDelete.amount)}.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteFlow(pendingDelete.id);
          setPendingDelete(null);
          toast("Deleted");
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Page>
  );
}
