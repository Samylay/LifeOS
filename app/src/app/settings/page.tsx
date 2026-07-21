"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import {
  Check, Loader2, X, Activity, Eye, EyeOff, Sun, Moon, Monitor,
  BellRing, Sunrise, RefreshCw, Gauge, Send,
} from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import { PushSettings } from "@/components/push-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// --- Theme -------------------------------------------------------------
// globals.css defines .light/.dark on :root; layout.tsx applies the effective
// class before first paint. Dark is the default: no stored preference resolves
// to dark regardless of the OS. "system" is now stored as an explicit value
// (not the absence of a key) so it stays distinguishable from the unset
// default — this control just keeps class + localStorage in step.

type Theme = "light" | "system" | "dark";

let themeListeners: (() => void)[] = [];
const themeStore = {
  subscribe(cb: () => void) {
    themeListeners.push(cb);
    return () => { themeListeners = themeListeners.filter((l) => l !== cb); };
  },
  get(): Theme {
    const s = localStorage.getItem("lifeos-theme");
    // Unset ⇒ dark default (matches the pre-paint script in layout.tsx).
    return s === "light" || s === "dark" || s === "system" ? s : "dark";
  },
  set(t: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    // Store every explicit choice — including "system" — so the unset state
    // stays reserved for the dark default.
    localStorage.setItem("lifeos-theme", t);
    // The effective class must always be present (shadcn tokens + `dark:`
    // utilities key off it), so resolve "system" here too.
    const effective =
      t === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : t;
    root.classList.add(effective);
    for (const l of themeListeners) l();
  },
};

function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "dark" as Theme);
  return [theme, themeStore.set];
}

// --- Shared bits ---------------------------------------------------------

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {sub && <CardDescription className="text-xs">{sub}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
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
            <p className="text-sm font-medium text-foreground">Strava</p>
            <p className="text-xs text-muted-foreground">
              {summary === null ? "Checking…"
                : ok ? `Connected · ${summary.weekCount ?? 0} activities / ${summary.weekKm ?? 0} km this week`
                : `Not configured (${summary.reason}) — set the STRAVA_* env vars`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ok && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#007CC3" strokeWidth="2" />
              <path d="M12 7v5l3 3" stroke="#007CC3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Garmin Connect</p>
            <p className="text-xs text-muted-foreground">
              {garmin.connection.connected
                ? `Connected as ${garmin.connection.displayName || "Garmin user"}`
                : "Sleep, HRV, and health data on the Training page"}
            </p>
          </div>
        </div>
        {garmin.connection.connected && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium" style={{ color: "#007CC3" }}>
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
            Credentials go straight to Garmin and are never stored — the session lives in app
            memory, so you&apos;ll need to reconnect after a restart or redeploy.
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
            className="text-xs text-white active:scale-[0.97]"
            style={{ background: "#007CC3" }}
          >
            {garmin.loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {garmin.loading ? "Connecting…" : "Connect to Garmin"}
          </Button>
        </div>
      )}

      {garmin.connection.connected && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-1.5">
            {["Activities", "Sleep", "Heart rate", "Steps", "HRV"].map((f) => (
              <span key={f} className="rounded border border-border bg-card px-2 py-0.5 text-xs" style={{ color: "#007CC3" }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Page --------------------------------------------------------------

const THEME_OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "system", label: "System", Icon: Monitor },
  { id: "dark", label: "Dark", Icon: Moon },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [theme, setTheme] = useTheme();
  const [briefRunning, setBriefRunning] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const rebuildBrief = async () => {
    setBriefRunning(true);
    try {
      const res = await fetch("/api/brief/run?force=1", { method: "POST" });
      const data = await res.json();
      if (data.ran) {
        const errs = (data.cards || []).filter((c: { error?: string | null }) => c.error).length;
        toast(`Brief rebuilt for ${data.date}${errs ? ` — ${errs} card${errs === 1 ? "" : "s"} errored` : ""}`);
      } else {
        toast(`Brief did not run: ${data.reason}`, "error");
      }
    } catch {
      toast("Brief rebuild failed", "error");
    } finally {
      setBriefRunning(false);
    }
  };

  const sendTestNotification = async () => {
    setTestSending(true);
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test notification from Settings", title: "LifeOS test" }),
      });
      toast(res.ok ? "Test sent — check /pager and your phone (ntfy)" : "Send failed", res.ok ? undefined : "error");
    } catch {
      toast("Send failed", "error");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Settings</h1>

      <div className="max-w-2xl space-y-4">
        {/* Appearance */}
        <Section title="Appearance">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Theme</span>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {THEME_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  aria-pressed={theme === id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[background,color,transform] duration-150 active:scale-[0.96]",
                    theme === id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Integrations */}
        <Section title="Integrations" sub="Training data sources. Status is live.">
          <div className="space-y-4">
            <StravaCard />
            <GarminCard />
          </div>
        </Section>

        {/* Morning brief */}
        <Section title="Morning brief" sub="Generated daily at 06:00 — rebuild if a card looks stale or errored.">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Sunrise size={18} className="text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Force a fresh build of today&apos;s brief.
              </p>
            </div>
            <Button
              onClick={rebuildBrief}
              disabled={briefRunning}
              size="sm"
              className="text-xs active:scale-[0.97]"
            >
              {briefRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {briefRunning ? "Rebuilding…" : "Rebuild now"}
            </Button>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" sub="Pager inbox + ntfy push to your phone (topic: homelab, tailnet-only).">
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

        {/* System */}
        <Section title="System">
          <Link
            href="/status"
            className="-m-3 flex items-center gap-3 rounded-lg p-3 transition-[background,transform] duration-150 hover:bg-muted active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Gauge size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Status</p>
              <p className="text-xs text-muted-foreground">Containers, standing goals, disk — the ops cockpit.</p>
            </div>
            <span className="text-muted-foreground">→</span>
          </Link>
        </Section>
      </div>
    </div>
  );
}
