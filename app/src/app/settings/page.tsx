"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/components/toast";
import {
  Check, Loader2, X, Activity, Eye, EyeOff, ChevronDown,
  BellRing, RefreshCw, Send, ListChecks, Plug, Info,
} from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import { PushSettings } from "@/components/push-settings";
import { BankAccountsCard } from "@/components/bank-accounts-card";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import appPackage from "../../../package.json";

const settingSections = [
  { title: "Connections", icon: Plug }, { title: "Notifications", icon: BellRing },
  { title: "Habits", icon: ListChecks }, { title: "About", icon: Info },
];
const sectionId = (title: string) => `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// --- Shared bits ---------------------------------------------------------

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => { if (window.location.hash === `#${sectionId(title)}` && ref.current) ref.current.open = true; };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [title]);
  const Icon = settingSections.find(section => section.title === title)?.icon ?? Plug;
  return <details ref={ref} id={sectionId(title)} className="group rounded-xl border border-border bg-card scroll-mt-20">
    <summary className="flex min-h-16 cursor-pointer items-center gap-3 p-4 pressable active:scale-[0.97]">
      <Icon size={20} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span>{sub && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{sub}</span>}</span><ChevronDown size={16} className="shrink-0 group-open:rotate-180 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)]" />
    </summary>
    <div className="border-t border-border p-4">{children}</div>
  </details>;
}

// --- Strava --------------------------------------------------------------

interface StravaSummary {
  ok: boolean;
  reason?: string;
  weekKm?: number;
  weekMinutes?: number;
  weekCount?: number;
  last?: { name: string; type: string; km: number; date: string } | null;
}

function StravaCard() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<StravaSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/strava/summary");
      setSummary(await res.json());
    } catch {
      setSummary({ ok: false, reason: "unreachable" });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();
      toast(res.ok ? `Strava synced${typeof data.fetched === "number" ? ` — ${data.fetched} fetched` : ""}` : "Sync failed", res.ok ? undefined : "error");
      await load();
    } catch {
      toast("Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const ok = summary?.ok === true;
  return (
    <div className="rounded-lg bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
            <Activity size={18} style={{ color: "#FC5200" }} />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: ok ? "var(--success)" : summary === null ? "var(--muted-foreground)" : "var(--warning)" }} />
              Strava
            </p>
            <p className="text-xs text-muted-foreground">
              {summary === null ? "Checking…"
                : ok ? `Connected · ${summary.weekCount ?? 0} activities / ${summary.weekKm ?? 0} km this week`
                : `Not connected (${summary.reason}) — Strava credentials are configured by the server`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ok && (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <Check size={12} /> Active
            </span>
          )}
          {ok && (
            <Button
              variant="outline"
              size="sm"
              onClick={sync}
              disabled={syncing}
              className="text-xs text-muted-foreground active:scale-[0.97]"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Sync now
            </Button>
          )}
        </div>
      </div>
      {ok && summary?.last && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Last: {summary.last.name} · {summary.last.km} km ·{" "}
          {new Date(summary.last.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" — "}
          <Link href="/workouts" className="text-primary">Training →</Link>
        </p>
      )}
    </div>
  );
}

// --- Garmin ----------------------------------------------------------------

function GarminCard() {
  const { toast } = useToast();
  const garmin = useGarmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const connect = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }
    setError(null);
    const success = await garmin.connect(email.trim(), password.trim());
    if (success) {
      toast("Garmin Connect linked");
      setEmail("");
      setPassword("");
    } else {
      setError(garmin.error || "Failed to connect");
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    await garmin.disconnect();
    toast("Garmin Connect disconnected", "info");
    setDisconnecting(false);
  };

  return (
    <div className="rounded-lg bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#007CC3" strokeWidth="2" />
              <path d="M12 7v5l3 3" stroke="#007CC3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: garmin.connection.connected ? "var(--success)" : "var(--muted-foreground)" }} />
              Garmin Connect
            </p>
            <p className="text-xs text-muted-foreground">
              {garmin.connection.connected
                ? `Connected as ${garmin.connection.displayName || "Garmin user"} · ${garmin.connection.lastSyncedAt ? `synced ${new Date(garmin.connection.lastSyncedAt).toLocaleString()}` : "not synced this session"}`
                : "Not connected · health data syncs from Garmin Connect"}
            </p>
          </div>
        </div>
        {garmin.connection.connected && (
          <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-success">
              <Check size={12} /> Active
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-muted-foreground active:scale-[0.97]"
            >
              {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {!garmin.connection.connected && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Your password goes straight to Garmin and is never stored. The access token it
            returns is saved to the data volume, so this login survives restarts and
            redeploys. Disconnect deletes it.
          </p>
          <div className="space-y-2">
            <Input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Garmin email" autoComplete="username"
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && connect()}
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Garmin password" autoComplete="current-password"
                className="pr-10 text-sm"
                onKeyDown={(e) => e.key === "Enter" && connect()}
              />
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={connect}
            disabled={garmin.loading}
            size="sm"
            className="text-xs active:scale-[0.97]"
          >
            {garmin.loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {garmin.loading ? "Connecting…" : "Connect to Garmin"}
          </Button>
        </div>
      )}

    </div>
  );
}

// --- Page --------------------------------------------------------------

export default function SettingsPage() {
  const { toast } = useToast();
  const [testSending, setTestSending] = useState(false);

  const sendTestNotification = async () => {
    setTestSending(true);
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test notification from Settings", title: "LifeOS test" }),
      });
      if (res.ok) {
        sonnerToast.success("Test sent — check your phone (push)", {
          action: { label: "Open status", onClick: () => { window.location.href = "/status"; } },
        });
      } else {
        toast("Send failed", "error");
      }
    } catch {
      toast("Send failed", "error");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Settings"
      />

      <div className="grid items-start gap-3">
        <Section title="Connections">
          <div className="space-y-3">
            <StravaCard />
            <GarminCard />
            <BankAccountsCard />
          </div>
        </Section>
        <Section title="Notifications">
          <div className="mb-4">
            <PushSettings />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <BellRing size={18} className="text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Send a test through the full path — pager inbox and phone push.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={sendTestNotification}
              disabled={testSending}
              size="sm"
              className="text-xs text-muted-foreground active:scale-[0.97]"
            >
              {testSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send test
            </Button>
          </div>
        </Section>

        <Section title="Habits">
          <Link href="/settings/habits" className="flex min-h-12 items-center justify-between rounded-lg border border-border px-4 text-sm pressable active:scale-[0.97] hover:bg-muted">
            <span className="font-medium">Manage habits</span><span className="text-muted-foreground" aria-hidden="true">→</span>
          </Link>
        </Section>
        <Section title="About">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">LifeOS version</span><span className="font-mono tabular-nums">{appPackage.version}</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
              <Link href="/status" className="min-h-11 inline-flex items-center text-primary pressable active:scale-[0.97]">System status</Link>
              <Link href="/" className="min-h-11 inline-flex items-center text-primary pressable active:scale-[0.97]">LifeOS home</Link>
            </div>
          </div>
        </Section>
      </div>
    </Page>
  );
}
