"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useIntegrations } from "@/lib/integrations-context";
import { useFocusTimer, DEFAULT_CONFIG } from "@/lib/use-focus";
import { useToast } from "@/components/toast";
import { ExternalLink, Check, Loader2, X, Bell, Activity, Webhook } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { gcal, connectGoogleCalendar, disconnectGoogleCalendar } = useIntegrations();
  const { config, applyConfig } = useFocusTimer();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [garminNotify, setGarminNotify] = useState(false);
  const [n8nNotify, setN8nNotify] = useState(false);

  const handleConnectGcal = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connectGoogleCalendar();
      toast("Google Calendar connected successfully");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      if (message.includes("popup-closed")) {
        setError("Sign-in popup was closed");
      } else {
        setError(message);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGcal = async () => {
    setDisconnecting(true);
    try {
      await disconnectGoogleCalendar();
      toast("Google Calendar disconnected", "info");
    } catch {
      setError("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Settings
      </h1>

      <div className="space-y-6 max-w-2xl">
        {/* Profile */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Profile
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Name</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {user?.displayName || "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Email</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {user?.email || "—"}
              </span>
            </div>
            {user?.photoURL && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Photo</span>
                <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              </div>
            )}
          </div>
        </div>

        {/* Focus Timer Defaults */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Focus Timer
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            Configure your default Pomodoro timer settings.
          </p>
          <div className="space-y-4">
            {[
              { label: "Focus duration", key: "focusDuration" as const, value: config.focusDuration, suffix: "min", hint: "How long each focus session lasts" },
              { label: "Short break", key: "breakDuration" as const, value: config.breakDuration, suffix: "min", hint: "Break between sessions" },
              { label: "Long break", key: "longBreakDuration" as const, value: config.longBreakDuration, suffix: "min", hint: "Extended break for recovery" },
              { label: "Long break after", key: "longBreakAfter" as const, value: config.longBreakAfter, suffix: "sessions", hint: "Sessions before long break" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <div>
                  <span className="text-sm block" style={{ color: "var(--text-primary)" }}>{item.label}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.hint}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={item.value}
                    onChange={(e) => applyConfig({ [item.key]: parseInt(e.target.value) || item.value })}
                    min={1}
                    max={item.key === "longBreakAfter" ? 10 : 120}
                    className="w-16 text-sm font-mono font-semibold px-2 py-1 rounded-lg text-right outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
                  />
                  <span className="text-xs w-12" style={{ color: "var(--text-tertiary)" }}>{item.suffix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Integrations */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Integrations
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            Connect external services to enhance your LifeOS experience.
          </p>
          <div className="space-y-4">
            {/* Google Calendar */}
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Google Calendar
                    </p>
                    {gcal.connected ? (
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {gcal.email
                          ? `Connected as ${gcal.email}`
                          : "Connected"}
                        {!gcal.accessToken && " — session expired, reconnect to sync"}
                      </p>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Sync your schedule and see events in LifeOS
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {gcal.connected ? (
                    <>
                      {!gcal.accessToken && (
                        <button
                          onClick={handleConnectGcal}
                          disabled={connecting}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{
                            background: "var(--accent-bg)",
                            color: "var(--accent)",
                          }}
                        >
                          {connecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                          Reconnect
                        </button>
                      )}
                      {gcal.accessToken && (
                        <span
                          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                          style={{ color: "var(--accent)" }}
                        >
                          <Check size={12} />
                          Active
                        </span>
                      )}
                      <button
                        onClick={handleDisconnectGcal}
                        disabled={disconnecting}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleConnectGcal}
                      disabled={connecting}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
                      style={{ background: "#4285F4" }}
                    >
                      {connecting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ExternalLink size={14} />
                      )}
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {gcal.connected && gcal.accessToken && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Your calendar events appear on the Dashboard, Calendar page, and alongside Focus Blocks. You can also sync Focus Blocks to your Google Calendar.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs px-1" style={{ color: "#ef4444" }}>
                {error}
              </p>
            )}

            {/* Garmin Connect */}
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="#007CC3" strokeWidth="2" />
                      <path d="M12 7v5l3 3" stroke="#007CC3" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Garmin Connect
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Sync training, sleep, and health data automatically
                    </p>
                  </div>
                </div>
                {garminNotify ? (
                  <span
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    <Check size={12} />
                    Subscribed
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setGarminNotify(true);
                      toast("We'll notify you when Garmin Connect is ready", "info");
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <Bell size={12} />
                    Notify Me
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                  Planned features:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Sleep tracking", "Heart rate", "Training load", "Steps", "Body battery"].map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-primary)" }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* n8n Webhooks */}
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12h4l3-9 3 18 3-9h4" stroke="#EA4B71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      n8n Webhooks
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Automate workflows with external services
                    </p>
                  </div>
                </div>
                {n8nNotify ? (
                  <span
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    <Check size={12} />
                    Subscribed
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setN8nNotify(true);
                      toast("We'll notify you when webhook support is ready", "info");
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <Bell size={12} />
                    Notify Me
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                  Planned automations:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Slack alerts", "Email digest", "Notion sync", "Todoist import", "Custom triggers"].map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-primary)" }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
