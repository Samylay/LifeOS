"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, RefreshCw, Landmark } from "lucide-react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Page, PageHeader, SectionHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { SourceAvatar } from "@/components/ui/avatar";
import { DonutChart, ProgressBar } from "@/components/charts";
import { ActivityLedger } from "@/components/finance/activity-ledger";
import { useFinanceBurn, type FinanceBurnOverview } from "@/lib/use-finance-burn";
import { formatMoney, type FinanceActivity } from "@/lib/finance-activity";
import type { RecurringChargeView } from "@/lib/finance-overview";
import { leftThisMonth } from "@/lib/finance-projection";

const formatMonth = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayString = (date: Date) => date.toISOString().slice(0, 10);
const eur = (value: number) => formatMoney(value);

function addCadence(date: Date, cadence: RecurringChargeView["cadence"]): Date {
  const next = new Date(date);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else {
    const months = cadence === "quarterly" ? 3 : cadence === "yearly" ? 12 : 1;
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const end = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, end));
  }
  return next;
}

function nextDue(charge: RecurringChargeView, today: string): string | null {
  if (charge.cadence === "unknown" || !charge.lastSeen) return null;
  let due = addCadence(new Date(`${charge.lastSeen}T00:00:00Z`), charge.cadence);
  for (let i = 0; i < 400 && dayString(due) < today; i++) due = addCadence(due, charge.cadence);
  return dayString(due);
}

function Avatar({ label }: { label: string }) {
  return <SourceAvatar source={label} label={label} size="sm" className="shrink-0" />;
}

function SpendingEarly({ activity, month, now }: { activity: FinanceActivity[]; month: string; now: Date }) {
  const previousDate = new Date(`${month}-01T00:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const through = now.getUTCDate();
  const sum = (m: string) => [...categoryTotals(activity, m, through).values()].reduce((total, value) => total + value, 0);
  return <p className="text-sm text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{eur(sum(month))}</span> spent in {through} day{through === 1 ? "" : "s"}, against <span className="tabular-nums">{eur(sum(dayString(previousDate).slice(0, 7)))}</span> by the same day last month. The trend line appears after a week.</p>;
}

function SpendingTrend({ activity, month, now }: { activity: FinanceActivity[]; month: string; now: Date }) {
  const previousDate = new Date(`${month}-01T00:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = dayString(previousDate).slice(0, 7);
  const throughDay = now.getUTCDate();
  const data = useMemo(() => {
    const currentDays = new Map<number, number>();
    const previousDays = new Map<number, number>();
    for (const item of activity) {
      if (item.direction !== "out" || item.isTransfer || !item.included || item.currency !== "EUR" || !item.date) continue;
      const itemMonth = item.date.slice(0, 7);
      const day = Number(item.date.slice(8, 10));
      if (itemMonth === month && day <= throughDay) currentDays.set(day, (currentDays.get(day) ?? 0) + item.amount);
      if (itemMonth === previousMonth && day <= throughDay) previousDays.set(day, (previousDays.get(day) ?? 0) + item.amount);
    }
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    let current = 0;
    let previous = 0;
    return Array.from({ length: Math.max(throughDay, 1) }, (_, index) => {
      const day = index + 1;
      current += currentDays.get(day) ?? 0;
      previous += previousDays.get(day) ?? 0;
      return { day, current, previous: day <= days ? previous : undefined };
    });
  }, [activity, month, previousMonth, throughDay]);
  return <div className="h-48 w-full" aria-label="Cumulative spending this month compared with last month">
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis width={42} tickFormatter={(value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => eur(Number(value))} labelFormatter={(day) => `Day ${day}`} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10 }} />
        <Line dataKey="current" name="This month" type="monotone" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        <Line dataKey="previous" name="Last month" type="monotone" stroke="var(--muted-foreground)" strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      </RechartsLineChart>
    </ResponsiveContainer>
  </div>;
}

function categoryTotals(activity: FinanceActivity[], month: string, maxDay: number) {
  const totals = new Map<string, number>();
  for (const item of activity) {
    if (item.direction !== "out" || item.isTransfer || !item.included || item.currency !== "EUR" || !item.date || !item.date.startsWith(month) || Number(item.date.slice(8, 10)) > maxDay) continue;
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  }
  return totals;
}

function CategoryBreakdown({ activity, month, now }: { activity: FinanceActivity[]; month: string; now: Date }) {
  const previousDate = new Date(`${month}-01T00:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = dayString(previousDate).slice(0, 7);
  const throughDay = now.getUTCDate();
  const current = categoryTotals(activity, month, throughDay);
  const previous = categoryTotals(activity, previousMonth, throughDay);
  const ordered = [...current].sort((a, b) => b[1] - a[1]);
  const categories = ordered.slice(0, 6).map(([name, amount]) => ({ name, amount, previous: previous.get(name) ?? 0 }));
  const otherCurrent = ordered.slice(6).reduce((total, [, amount]) => total + amount, 0);
  const otherPrevious = [...previous].filter(([name]) => !categories.some((item) => item.name === name)).reduce((total, [, amount]) => total + amount, 0);
  if (otherCurrent || otherPrevious) categories.push({ name: "Other", amount: otherCurrent, previous: otherPrevious });
  const chartData = categories.filter((item) => item.amount > 0).map((item) => ({ name: item.name, amount: item.amount }));
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  const uncategorised = categories.find((item) => item.name === "Other")?.amount ?? 0;
  const mostlyUncategorised = total > 0 && uncategorised / total > 0.7;
  return <Card className="gap-3 p-4">
    <SectionHeader title="Categories" />
    {mostlyUncategorised && <p className="text-xs text-muted-foreground">Most of this month is uncategorised, so a chart would say nothing. Label a merchant once in the list below and it stays labelled.</p>}
    {chartData.length ? <div className={`grid items-center gap-3 ${mostlyUncategorised ? "" : "sm:grid-cols-[minmax(140px,0.8fr)_1.2fr]"}`}>
      {!mostlyUncategorised && <DonutChart data={chartData} category="amount" index="name" label={eur(total)} valueFormatter={(value) => eur(Number(value))} className="h-40" />}
      <div className="space-y-1">
        {categories.map(({ name, amount, previous: old }) => {
          const change = amount - old;
          return <div key={name} className="flex min-h-10 items-center gap-2 border-b border-border/60 py-1 last:border-0">
            <Avatar label={name} />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <span className="text-right text-sm tabular-nums">{eur(amount)}<span className={`block text-xs ${change > 0 ? "text-warning" : "text-primary"}`}>{change > 0 ? "+" : ""}{eur(change)} vs last month</span></span>
          </div>;
        })}
      </div>
    </div> : <EmptyState icon={Landmark} hint="Bank categories will appear after transactions sync." compact />}
  </Card>;
}

function upcomingCharges(charges: RecurringChargeView[], today: string, throughDate: string) {
  return charges.map((charge) => ({ charge, date: nextDue(charge, today) }))
    .filter((item): item is { charge: RecurringChargeView; date: string } => item.date !== null && item.date <= throughDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function Upcoming({ charges, today, throughDate }: { charges: RecurringChargeView[]; today: string; throughDate: string }) {
  const upcoming = upcomingCharges(charges, today, throughDate).slice(0, 5);
  return <Card className="gap-3 p-4">
    <SectionHeader title="Upcoming" />
    {upcoming.length ? <div>{upcoming.map(({ charge, date }) => <div key={charge.merchantKey} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <Avatar label={charge.label} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{charge.label}</p><p className="text-xs text-muted-foreground">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</p></div>
      <span className={`text-sm tabular-nums ${charge.direction === "in" ? "text-success" : ""}`}>{charge.direction === "in" ? "+" : "−"}{eur(charge.amount)}</span>
    </div>)}</div> : <EmptyState icon={Landmark} hint="No detected recurring charges are due this month." compact />}
  </Card>;
}

function Accounts({ overview }: { overview: FinanceBurnOverview }) {
  return <Card className="gap-3 p-4">
    <div className="flex items-center justify-between gap-3"><SectionHeader title="Accounts" /><Link href="/settings" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]">Manage banks</Link></div>
    {overview.accounts.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{overview.accounts.map((account) => <div key={account.accountUid} className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2"><Avatar label={account.aspspName || "Bank"} /><p className="truncate text-xs font-medium">{account.aspspName || "Bank"}</p></div>
      <p className="mt-3 truncate text-lg font-semibold tabular-nums">{account.balanceAmount !== null ? formatMoney(Number(account.balanceAmount), account.balanceCurrency || "EUR") : "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{account.balanceSyncedAt ? `Updated ${new Date(account.balanceSyncedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Balance unavailable"}</p>
    </div>)}</div> : <EmptyState icon={Landmark} title="No bank connected" hint="Connect a bank to see synced balances and transactions." action={<Button asChild size="sm" variant="outline"><Link href="/settings">Connect a bank</Link></Button>} compact />}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground"><span>{overview.lastSyncedLabel}{overview.stale ? " · Sync may be overdue" : " · Bank sync active"}</span>{overview.consentWarnings.length > 0 && <Link href="/settings" className="min-h-11 content-center text-warning underline-offset-4 hover:underline">Reconnect a bank</Link>}</div>
  </Card>;
}

function FinanceDashboard({ overview, refresh }: { overview: FinanceBurnOverview; refresh: () => Promise<void> }) {
  const [showFormula, setShowFormula] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const now = new Date();
  const month = overview.months.at(-1)?.burn.month ?? dayString(now).slice(0, 7);
  const today = dayString(now);
  const monthEnd = dayString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const currentBurn = overview.months.at(-1)?.burn;
  const coming = upcomingCharges(overview.recurringCharges, today, monthEnd);
  const nextQuarter = dayString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 90)));
  const recurringIncome = coming.filter(({ charge }) => charge.direction === "in").reduce((sum, item) => sum + item.charge.amount, 0);
  const remainingCharges = coming.filter(({ charge }) => charge.direction === "out").reduce((sum, item) => sum + item.charge.amount, 0);
  const income = currentBurn?.in ?? 0;
  const spent = currentBurn?.out ?? 0;
  const projection = leftThisMonth({ incomeSoFar: income, expectedRecurringIncome: recurringIncome, spent, remainingRecurringCharges: remainingCharges });
  const daysInMonth = Number(monthEnd.slice(8, 10));
  const elapsed = Math.min(now.getUTCDate(), daysInMonth);
  const weekEnd = dayString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7)));
  const nextWeek = upcomingCharges(overview.recurringCharges, today, weekEnd);
  const weekIn = nextWeek.filter(({ charge }) => charge.direction === "in").reduce((sum, item) => sum + item.charge.amount, 0);
  const weekOut = nextWeek.filter(({ charge }) => charge.direction === "out").reduce((sum, item) => sum + item.charge.amount, 0);
  const earlyMonth = elapsed < 10 && projection.left < 0;
  const incomeLabel = projection.incomeSource === "received" ? "income received" : "expected recurring income";
  async function sync() {
    setSyncing(true); setSyncError(null);
    try {
      const response = await fetch("/api/finance/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.reason || "Bank sync failed. Try again.");
      await refresh();
    } catch (error) { setSyncError(error instanceof Error ? error.message : "Bank sync failed. Try again."); }
    finally { setSyncing(false); }
  }
  return <div className="space-y-4">
    <Card className="gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Left this month</p><p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{eur(projection.left)}</p><p className="mt-1 text-xs text-muted-foreground">{formatMonth(month)} · Next 7 days: +{eur(weekIn)} in, −{eur(weekOut)} out</p>{earlyMonth && <p className="mt-1 text-xs text-muted-foreground">Early in the month this counts bills before your income arrives.</p>}</div><button type="button" aria-expanded={showFormula} onClick={() => setShowFormula(!showFormula)} className="min-h-11 rounded-full border border-border px-3 text-xs text-muted-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]">How?</button></div>
      <div className="grid gap-2 sm:grid-cols-2"><ProgressBar value={elapsed} max={daysInMonth} label={`Month elapsed · ${elapsed}/${daysInMonth} days`} showValue valueFormatter={(value, max) => `${Math.round(value / max * 100)}%`} /><ProgressBar value={spent} max={Math.max(projection.income, spent, 1)} label="Spent vs income" showValue valueFormatter={(value, max) => `${Math.round(value / max * 100)}%`} color="var(--chart-1)" /></div>
      {showFormula && <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-4"><span className="text-muted-foreground">{incomeLabel}</span><span className="text-right tabular-nums">{eur(projection.income)}</span><span className="text-muted-foreground">Spent</span><span className="text-right tabular-nums">−{eur(projection.spent)}</span><span className="text-muted-foreground">Charges still due</span><span className="text-right tabular-nums">−{eur(projection.remainingRecurringCharges)}</span><span className="font-medium">Left</span><span className="text-right font-medium tabular-nums">{eur(projection.left)}</span></div>}
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="gap-3 p-4"><SectionHeader title="Spending" /><div className="flex gap-4 text-xs"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-chart-2" />This month</span><span className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full bg-muted-foreground" />Last month</span></div>{elapsed < 7 ? <SpendingEarly activity={overview.activity} month={month} now={now} /> : <SpendingTrend activity={overview.activity} month={month} now={now} />}</Card>
      <CategoryBreakdown activity={overview.activity} month={month} now={now} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2"><Upcoming charges={overview.recurringCharges} today={today} throughDate={nextQuarter} /><Accounts overview={overview} /></div>
    <ActivityLedger activity={overview.activity} refresh={refresh} />
    {overview.syncError && <p role="alert" className="text-sm text-warning">{overview.syncError}</p>}
    {syncError && <p role="alert" className="text-sm text-destructive">{syncError}</p>}
    <div className="flex justify-end"><Button variant="outline" onClick={() => void sync()} disabled={syncing || !overview.configured || overview.accounts.length === 0} className="active:scale-[0.97]"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} />{syncing ? "Syncing…" : "Sync now"}</Button></div>
  </div>;
}

export default function FinancePage() {
  const { overview, loading, error, refresh } = useFinanceBurn();
  return <Page className="max-w-6xl">
    <PageHeader title="Money" icon={Wallet} />
    {loading && !overview ? <Card className="gap-4 p-4"><Skeleton className="h-12 w-48" /><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /></Card> : overview ? <FinanceDashboard overview={overview} refresh={refresh} /> : <Card className="p-4"><EmptyState icon={Landmark} title="Couldn’t load your money overview" hint={error || "Check the bank connection and retry."} action={<Button variant="outline" onClick={() => void refresh()}>Retry</Button>} /></Card>}
  </Page>;
}
