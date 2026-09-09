"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  RefreshCw,
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
import { useFinanceBurn, type FinanceBurnOverview } from "@/lib/use-finance-burn";
import type { RecurringChargeView } from "@/lib/finance-overview";
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
import { KpiCard } from "@/components/charts";
import { MonthHistory, monthLabel } from "@/components/finance/month-history";
import { ActivityLedger } from "@/components/finance/activity-ledger";
import { formatMoney } from "@/lib/finance-activity";

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
    "pressable rounded-full px-3 py-1 text-xs font-medium transition-transform duration-[var(--dur-fast)] active:scale-[0.97]",
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
        <p className="break-words text-sm font-medium text-foreground">
          {flow.label}
          {flow.dormant && (
            <Badge variant="outline" className="ml-2 gap-1 text-[10px] font-medium">
              <MoonStar size={10} /> unused
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {flow.direction === "in" ? "Income" : "Cost"} · {formatMoney(flow.amount)} {CADENCE_LABEL[flow.cadence]}
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
            aria-label={`${flow.dormant ? "Mark as used" : "Mark as unused"}: ${flow.label}`}
            className={flow.dormant ? "text-primary" : "text-muted-foreground"}
          >
            <MoonStar size={15} />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-muted-foreground" title="Delete" aria-label={`Delete manual entry ${flow.label}`}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
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
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-transform duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
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
          <Badge variant="secondary">{KIND_LABEL[charge.kind]}</Badge>
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
  const { overview, loading, error, correctCharge, clearCorrection, refresh } = useFinanceBurn();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true); setSyncError(null);
    try {
      const response = await fetch("/api/finance/sync", { method: "POST" });
      const result = await response.json();
      await refresh();
      if (!response.ok || !result.ok) throw new Error(result.reason || "Bank sync failed. Please retry.");
      toast(`Synced. ${result.totalInserted} new transactions.`, "success");
    } catch (error) { setSyncError(error instanceof Error ? error.message : "Bank sync failed. Please retry."); }
    finally { setSyncing(false); }
  };
  const handleCorrect = async (merchantKey: string, kind: FlowKind) => {
    try { await correctCharge(merchantKey, kind); toast(`Moved to ${KIND_LABEL[kind]}`, "success"); }
    catch { toast("Couldn't save the correction", "error"); }
  };
  const handleClear = async (merchantKey: string) => {
    try { await clearCorrection(merchantKey); toast("Back to detected classification", "success"); }
    catch { toast("Couldn't clear the correction", "error"); }
  };
  if (loading && !overview) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!overview || !overview.months.length) return <Card className="gap-2 p-4"><p>Bank overview could not load.</p><Button variant="outline" onClick={() => void refresh()}>Retry</Button></Card>;
  const months = overview.months;
  const current = months.find((month) => month.burn.month === selectedMonth) ?? months.at(-1)!;
  const month = current.burn.month;
  const linked = overview.accounts.length > 0;
  const nextSync = overview.nextSyncAt ? new Date(overview.nextSyncAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  return <div className="space-y-4">
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Connected banks</h2><p className="mt-1 text-xs text-muted-foreground">{overview.lastSyncedLabel} · {linked && overview.configured ? "Automatic sync every 5 hours" : "Automatic sync starts after connection"}{nextSync ? ` · Next around ${nextSync}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void sync()} disabled={syncing || !overview.configured || !linked}><RefreshCw size={14} className={syncing ? "animate-spin" : ""} />{syncing ? "Syncing…" : "Sync now"}</Button>
          {!linked && <Button asChild variant="outline"><Link href="/settings">Connect a bank</Link></Button>}
        </div>
      </div>
      {!overview.configured && <p className="text-sm text-muted-foreground">Bank connection setup is incomplete. Your saved history is still available.</p>}
      {(syncError || overview.syncError || error) && <p role="alert" className="text-sm text-destructive">{syncError || overview.syncError || "Could not refresh this overview. Showing the last loaded data."}</p>}
    </Card>
    {linked && <BurnBanner overview={overview} />}
    <Card className="gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{monthLabel(month)}</h2><span className="text-xs text-muted-foreground">EUR only{month === months.at(-1)?.burn.month ? " · Month in progress" : ""}</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Spent" value={formatMoney(current.burn.out)} icon={<TrendingDown size={13} />} />
        <KpiCard label="Income" value={formatMoney(current.burn.in)} icon={<TrendingUp size={13} />} />
        <KpiCard label="Net cash flow" value={formatMoney(current.burn.in - current.burn.out)} icon={<PiggyBank size={13} />} />
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        {[["Fixed bills", current.burn.fixed], ["Subscriptions", current.burn.sub], ["Other spending", current.burn.variable], ["Transfers", current.burn.transfer]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(Number(value))}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">Transfers between your accounts are excluded from spending and income. Other currencies appear in transactions.</p>
      {current.undetermined.length > 0 && <p className="text-xs text-warning">{current.undetermined.length} transactions need review and are excluded from these totals.</p>}
      <MonthHistory months={months} selected={month} onSelect={setSelectedMonth} />
    </Card>
    <ActivityLedger key={month} activity={overview.activity ?? []} month={month} refresh={refresh} />
    {linked && <Card className="gap-2 p-4"><h2 className="text-sm font-semibold">Account balances</h2>{overview.accounts.map((account) => <div key={account.accountUid} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0"><p className="text-sm font-medium">{account.aspspName || "Bank"} · {account.accountUid.slice(-4)}</p><p className="text-xs text-muted-foreground">{account.balanceSyncedAt ? `Balance updated ${formatSyncedDate(account.balanceSyncedAt)}` : "No balance available"}</p></div>
      <span className="text-sm font-medium tabular-nums">{account.balanceAmount !== null ? formatMoney(Number(account.balanceAmount), account.balanceCurrency || "EUR") : "—"}</span>
    </div>)}</Card>}
    <RecurringChargesCard charges={overview.recurringCharges} onCorrect={handleCorrect} onClear={handleClear} />
  </div>;
}

export default function FinancePage() {
  const {
    flows,
    loading,
    addFlow,
    addFlows,
    updateFlow,
    deleteFlow,
  } = useFinance();
  const { toast } = useToast();
  const [mode, setMode] = useState<"none" | "paste" | "quick">("none");
  const [pendingDelete, setPendingDelete] = useState<FinanceFlow | null>(null);

  return (
    <Page>
      <PageHeader
        kicker="Money"
        title="Finance"
        description="Income, spending, and recurring costs."
        icon={Wallet}
      />

      <BurnOverview />

      <section aria-labelledby="manual-entries-heading" className="space-y-3">
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="manual-entries-heading" className="text-sm font-semibold">Manual entries</h2>
              <p className="mt-1 text-sm text-muted-foreground">Optional notes for planned income and costs. Separate from your bank totals.</p>
            </div>
            {mode === "none" && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setMode("paste")} className="gap-1.5"><ClipboardPaste size={15} /> Paste list</Button>
              <Button size="sm" variant="secondary" onClick={() => setMode("quick")} className="gap-1.5"><Plus size={15} /> Add entry</Button>
            </div>}
          </div>
          {loading && flows.length === 0 ? <Skeleton className="h-16 w-full rounded-lg" /> : flows.length > 0 ? (
            <div>
              {flows.map((flow) => <FlowRow key={flow.id} flow={flow}
                onToggleDormant={flow.kind === "sub" && flow.direction === "out" ? () => updateFlow(flow.id, { dormant: !flow.dormant }) : undefined}
                onDelete={() => setPendingDelete(flow)} />)}
            </div>
          ) : <p className="text-xs text-muted-foreground">No manual entries. Connected banks update the overview above.</p>}
        </Card>
        {mode === "paste" && <PasteBox onCancel={() => setMode("none")} onImport={async (drafts) => {
          setMode("none");
          await addFlows(drafts);
          toast(`${drafts.length} row${drafts.length === 1 ? "" : "s"} added`);
        }} />}
        {mode === "quick" && <QuickAdd onCancel={() => setMode("none")} onAdd={async (draft) => {
          setMode("none");
          await addFlow(draft);
          toast("Added");
        }} />}
      </section>

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
