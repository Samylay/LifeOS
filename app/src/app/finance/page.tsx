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
} from "lucide-react";
import { useFinance } from "@/lib/use-finance";
import { useBankAccounts } from "@/lib/use-bank-accounts";
import { isConsentExpired } from "@/lib/bank-consent-tripwire";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CADENCE_LABEL,
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

/**
 * The bank-fed half (T71): connected accounts + real balances + a marker on
 * synced rows, kept visibly separate from the hand-kept flows above per
 * T83's D4 boundary — this never merges into `financeFlows`. No live Enable
 * Banking consent has completed against this repo yet, so the everyday state
 * here is the empty one below.
 */
function ConnectedAccountsPanel() {
  const { configured, accounts, recentTransactions, loading } = useBankAccounts();

  if (loading && accounts.length === 0) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balanceAmount ? Number(a.balanceAmount) : 0), 0);
  const hasBalances = accounts.some((a) => a.balanceAmount !== null);

  if (accounts.length === 0) {
    return (
      <Card className="enter gap-2 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Landmark size={15} className="text-muted-foreground" /> Connected accounts
        </p>
        <p className="text-sm text-muted-foreground">
          No bank connected yet.{" "}
          {configured
            ? "Enable Banking is set up but no account has been linked through the consent flow."
            : "Enable Banking credentials aren't configured."}{" "}
          The numbers above stay hand-kept until then.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="enter gap-3 px-4 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Landmark size={15} className="text-muted-foreground" /> Connected accounts
          </p>
          {hasBalances && (
            <p className="text-xs tabular-nums text-muted-foreground">{formatEuro(totalBalance)} total</p>
          )}
        </div>
        <div>
          {accounts.map((a) => (
            <div
              key={a.accountUid}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                  <span className="truncate">
                    {a.aspspName ?? "Linked account"}
                    {a.aspspCountry && <span className="text-muted-foreground"> · {a.aspspCountry}</span>}
                  </span>
                  {isConsentExpired(a.validUntil) && (
                    <Badge variant="destructive" className="shrink-0 text-[10px] font-medium">
                      stale
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isConsentExpired(a.validUntil)
                    ? "Consent expired — reconnect at your bank to resume syncing."
                    : a.balanceSyncedAt
                      ? `Synced ${new Date(a.balanceSyncedAt).toLocaleDateString("fr-FR")}`
                      : "Not synced yet"}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-sm text-foreground">
                {a.balanceAmount !== null ? formatEuro(Number(a.balanceAmount)) : "—"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {recentTransactions.length > 0 && (
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
                    <p className="truncate text-sm text-foreground">
                      {t.creditorName ?? t.debtorName ?? "Unlabelled"}
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-medium text-muted-foreground">
                      synced
                    </Badge>
                  </div>
                  <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                    {formatEuro(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-foreground">
            <Wallet size={22} className="text-primary" /> Finance
          </h1>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Rentrées, sorties, and what the subscriptions actually cost. Kept by hand.
          </p>
        </div>
        {mode === "none" && !empty && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode("paste")} className="gap-1.5 text-sm">
              <ClipboardPaste size={15} /> Paste list
            </Button>
            <Button size="sm" onClick={() => setMode("quick")} className="gap-1.5 text-sm">
              <Plus size={15} /> Add
            </Button>
          </div>
        )}
      </div>

      <ConnectedAccountsPanel />

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
        <>
          {/* The month, in three numbers. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="In" value={formatEuro(totals.monthlyIn, { decimals: false })} icon={<TrendingUp size={13} />} />
            <KpiCard label="Out" value={formatEuro(totals.monthlyOut, { decimals: false })} icon={<TrendingDown size={13} />} />
            <KpiCard
              label="Left over"
              value={formatEuro(totals.monthlyLeft, { decimals: false })}
              icon={<PiggyBank size={13} />}
              className={totals.monthlyLeft < 0 ? "border-destructive/50" : undefined}
            />
          </div>

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
    </div>
  );
}
