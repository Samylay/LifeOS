"use client";

// Bank connection management, alongside the other integrations in Settings:
// which accounts are linked, what they hold, and the entry point to the Enable
// Banking consent flow. The bank's *content* (recent activity) stays on
// /finance — this card is only the plumbing.
import { useState } from "react";
import { Landmark, RefreshCw } from "lucide-react";
import { useBankAccounts } from "@/lib/use-bank-accounts";
import { isConsentExpired } from "@/lib/bank-consent-tripwire";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEuro } from "@/lib/finance";

/** Consent flow entry point: lists the banks Enable Banking knows, links to /api/finance/connect. */
function ConnectBankPicker() {
  const [aspsps, setAspsps] = useState<Array<{ name: string; country: string }> | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/finance/aspsps?country=FR");
      const body = await r.json();
      if (!r.ok || !body.aspsps?.length) return setError(true);
      setAspsps(body.aspsps);
    } catch {
      setError(true);
    }
  };

  if (error) {
    return <p className="text-sm text-muted-foreground">Could not reach Enable Banking to list banks.</p>;
  }

  if (!aspsps) {
    return (
      <Button size="sm" variant="outline" className="w-fit gap-1.5" onClick={load}>
        <Landmark size={14} /> Connect a bank
      </Button>
    );
  }

  const shown = aspsps
    .filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search your bank…"
        className="h-8 max-w-xs text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {shown.map((a) => (
          <Button key={`${a.name}-${a.country}`} size="sm" variant="outline" asChild>
            <a href={`/api/finance/connect?aspsp=${encodeURIComponent(a.name)}&country=${encodeURIComponent(a.country)}`}>
              {a.name}
            </a>
          </Button>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">No bank matches that.</p>}
      </div>
    </div>
  );
}

export function BankAccountsCard() {
  const { configured, accounts, loading, refresh } = useBankAccounts();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/finance/sync", { method: "POST" });
      const body = await r.json();
      if (!r.ok || !body.ok) throw new Error(body.message ?? "sync failed");
      toast(`Synced — ${body.totalInserted} new transaction${body.totalInserted === 1 ? "" : "s"}.`);
      await refresh();
    } catch {
      toast("Sync failed. Check the consent is still valid.");
    } finally {
      setSyncing(false);
    }
  };

  if (loading && accounts.length === 0) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  if (!configured) {
    return <p className="text-sm text-muted-foreground">Enable Banking credentials aren&apos;t configured.</p>;
  }

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balanceAmount ? Number(a.balanceAmount) : 0), 0);
  const hasBalances = accounts.some((a) => a.balanceAmount !== null);

  return (
    <div className="space-y-3">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bank connected yet — /finance stays hand-kept until one is.
        </p>
      ) : (
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
                    ? "Consent expired — reconnect to resume syncing."
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
          {hasBalances && accounts.length > 1 && (
            <p className="pt-2 text-right text-xs tabular-nums text-muted-foreground">
              {formatEuro(totalBalance)} total
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ConnectBankPicker />
        {accounts.length > 0 && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={sync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        )}
      </div>
    </div>
  );
}
