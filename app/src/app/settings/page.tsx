"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import {
  Check, Loader2, X, Activity, Eye, EyeOff, Sun, Moon, Monitor,
  BellRing, Sunrise, RefreshCw, Gauge, Send,
} from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";

// --- Theme -------------------------------------------------------------
// globals.css defines .light/.dark on :root with a prefers-color-scheme
// fallback when neither is set; layout.tsx applies the stored class before
// first paint. This control just keeps class + localStorage in step.

type Theme = "light" | "system" | "dark";

let themeListeners: (() => void)[] = [];
const themeStore = {
  subscribe(cb: () => void) {
    themeListeners.push(cb);
    return () => { themeListeners = themeListeners.filter((l) => l !== cb); };
  },
  get(): Theme {
    const s = localStorage.getItem("lifeos-theme");
    return s === "light" || s === "dark" ? s : "system";
  },
  set(t: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "system") localStorage.removeItem("lifeos-theme");
    else localStorage.setItem("lifeos-theme", t);
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
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "system" as Theme);
  return [theme, themeStore.set];
}

// --- Shared bits ---------------------------------------------------------

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const fieldStyle = {
  border: "1px solid var(--border-primary)",
  color: "var(--text-primary)",
} as const;

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
    <div className="rounded-lg p-4" style={{ background: "var(--bg-tertiary)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: "var(--bg-secondary)" }}>
            <Activity size={18} style={{ color: "#FC5200" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Strava</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {summary === null ? "Checking…"
                : ok ? `Connected · ${summary.weekCount ?? 0} activities / ${summary.weekKm ?? 0} km this week`
                : `Not configured (${summary.reason}) — set the STRAVA_* env vars`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ok && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
              <Check size={12} /> Active
            </span>
          )}
          {ok && (
            <button onClick={sync} disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
              style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-primary)" }}>
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Sync now
            </button>
          )}
        </div>
      </div>
      {ok && summary?.last && (
        <p className="text-xs mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}>
          Last: {summary.last.name} · {summary.last.km} km ·{" "}
          {new Date(summary.last.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" — "}
          <Link href="/workouts" style={{ color: "var(--accent)" }}>Training →</Link>
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
    <div className="rounded-lg p-4" style={{ background: "var(--bg-tertiary)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--bg-secondary)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#007CC3" strokeWidth="2" />
              <path d="M12 7v5l3 3" stroke="#007CC3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Garmin Connect</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {garmin.connection.connected
                ? `Connected as ${garmin.connection.displayName || "Garmin user"}`
                : "Sleep, HRV, and health data on the Training page"}
            </p>
          </div>
        </div>
        {garmin.connection.connected && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded" style={{ color: "#007CC3" }}>
              <Check size={12} /> Active
            </span>
            <button onClick={disconnect} disabled={disconnecting}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
              style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-primary)" }}>
              {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Disconnect
            </button>
          </div>
        )}
      </div>

      {!garmin.connection.connected && (
        <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Credentials go straight to Garmin and are never stored — the session lives in app
            memory, so you&apos;ll need to reconnect after a restart or redeploy.
          </p>
          <div className="space-y-2">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Garmin email" autoComplete="username"
              className="w-full text-sm bg-transparent rounded-lg px-3 py-2 outline-none" style={fieldStyle}
              onKeyDown={(e) => e.key === "Enter" && connect()}
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Garmin password" autoComplete="current-password"
                className="w-full text-sm bg-transparent rounded-lg px-3 py-2 pr-10 outline-none" style={fieldStyle}
                onKeyDown={(e) => e.key === "Enter" && connect()}
              />
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--text-tertiary)" }}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
          <button onClick={connect} disabled={garmin.loading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-transform duration-150 active:scale-[0.97] disabled:opacity-70"
            style={{ background: "#007CC3" }}>
            {garmin.loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {garmin.loading ? "Connecting…" : "Connect to Garmin"}
          </button>
        </div>
      )}

      {garmin.connection.connected && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <div className="flex flex-wrap gap-1.5">
            {["Activities", "Sleep", "Heart rate", "Steps", "HRV"].map((f) => (
              <span key={f} className="text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--bg-secondary)", color: "#007CC3", border: "1px solid var(--border-primary)" }}>
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
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Settings
      </h1>

      <div className="space-y-6 max-w-2xl">
        {/* Appearance */}
        <Section title="Appearance">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Theme</span>
            <div className="flex rounded-lg p-1 gap-1" style={{ background: "var(--bg-tertiary)" }}>
              {THEME_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  aria-pressed={theme === id}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[background,color,transform] duration-150 active:scale-[0.96]"
                  style={{
                    background: theme === id ? "var(--bg-secondary)" : "transparent",
                    color: theme === id ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: theme === id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  }}
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                <Sunrise size={18} style={{ color: "var(--accent)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Force a fresh build of today&apos;s brief.
              </p>
            </div>
            <button onClick={rebuildBrief} disabled={briefRunning}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-sage-400 text-white hover:bg-sage-500 transition-[background,transform] duration-150 active:scale-[0.97] disabled:opacity-60">
              {briefRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {briefRunning ? "Rebuilding…" : "Rebuild now"}
            </button>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" sub="Pager inbox + ntfy push to your phone (topic: homelab, tailnet-only).">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                <BellRing size={18} style={{ color: "var(--accent)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Send a test through the full path — pager inbox and phone push.
              </p>
            </div>
            <button onClick={sendTestNotification} disabled={testSending}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-primary)" }}>
              {testSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send test
            </button>
          </div>
        </Section>

        {/* System */}
        <Section title="System">
          <Link href="/status"
            className="flex items-center gap-3 rounded-lg p-3 -m-3 transition-[background,transform] duration-150 active:scale-[0.99] hover:bg-[var(--bg-tertiary)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <Gauge size={18} style={{ color: "var(--accent)" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Status</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Containers, standing goals, disk — the ops cockpit.</p>
            </div>
            <span style={{ color: "var(--text-tertiary)" }}>→</span>
          </Link>
        </Section>
      </div>
    </div>
  );
}
