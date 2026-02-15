"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useIntegrations } from "@/lib/integrations-context";
import { ExternalLink, Check, Loader2, X } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { gcal, connectGoogleCalendar, disconnectGoogleCalendar } = useIntegrations();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnectGcal = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connectGoogleCalendar();
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
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Name</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {user?.displayName || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Email</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {user?.email || "—"}
              </span>
            </div>
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
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Focus Timer
          </h2>
          <div className="space-y-4">
            {[
              { label: "Focus duration", value: "25 min" },
              { label: "Short break", value: "5 min" },
              { label: "Long break", value: "15 min" },
              { label: "Long break after", value: "4 sessions" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                <span
                  className="text-sm font-mono font-semibold px-3 py-1 rounded-lg"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                >
                  {item.value}
                </span>
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
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Integrations
          </h2>
          <div className="space-y-5">
            {/* Google Calendar */}
            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
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

            {error && (
              <p className="text-xs px-1" style={{ color: "#ef4444" }}>
                {error}
              </p>
            )}

            {/* Garmin Connect */}
            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
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
                    Sync training, sleep, and health data
                  </p>
                </div>
              </div>
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-primary)" }}
              >
                Coming in Phase 2
              </span>
            </div>

            {/* n8n Webhooks */}
            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)" }}
            >
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
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-primary)" }}
              >
                Coming in Phase 6
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
