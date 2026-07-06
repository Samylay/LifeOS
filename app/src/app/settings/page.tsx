"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/toast";
import { ExternalLink, Check, Loader2, X, Bell, Activity, Webhook, Eye, EyeOff } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const garmin = useGarmin();
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  const [garminDisconnecting, setGarminDisconnecting] = useState(false);
  const [n8nNotify, setN8nNotify] = useState(false);

  const handleConnectGarmin = async () => {
    if (!garminEmail.trim() || !garminPassword.trim()) {
      setGarminError("Email and password are required");
      return;
    }
    setGarminError(null);
    const success = await garmin.connect(garminEmail.trim(), garminPassword.trim());
    if (success) {
      toast("Garmin Connect linked successfully");
      setGarminEmail("");
      setGarminPassword("");
    } else {
      setGarminError(garmin.error || "Failed to connect");
    }
  };

  const handleDisconnectGarmin = async () => {
    setGarminDisconnecting(true);
    await garmin.disconnect();
    toast("Garmin Connect disconnected", "info");
    setGarminDisconnecting(false);
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
            Connect external services to enhance your Stride experience.
          </p>
          <div className="space-y-4">
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
                    {garmin.connection.connected ? (
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Connected as {garmin.connection.displayName || "Garmin user"}
                      </p>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Sync training, sleep, and health data from your Garmin
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {garmin.connection.connected ? (
                    <>
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                        style={{ color: "#007CC3" }}
                      >
                        <Check size={12} />
                        Active
                      </span>
                      <button
                        onClick={handleDisconnectGarmin}
                        disabled={garminDisconnecting}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        {garminDisconnecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        Disconnect
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {!garmin.connection.connected && (
                <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Enter your Garmin Connect credentials to link your account. Your credentials are only used to authenticate with Garmin and are not stored.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={garminEmail}
                      onChange={(e) => setGarminEmail(e.target.value)}
                      placeholder="Garmin email"
                      className="w-full text-sm bg-transparent rounded-lg px-3 py-2 outline-none"
                      style={{
                        border: "1px solid var(--border-primary)",
                        color: "var(--text-primary)",
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleConnectGarmin()}
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={garminPassword}
                        onChange={(e) => setGarminPassword(e.target.value)}
                        placeholder="Garmin password"
                        className="w-full text-sm bg-transparent rounded-lg px-3 py-2 pr-10 outline-none"
                        style={{
                          border: "1px solid var(--border-primary)",
                          color: "var(--text-primary)",
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleConnectGarmin()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  {garminError && (
                    <p className="text-xs" style={{ color: "#ef4444" }}>
                      {garminError}
                    </p>
                  )}
                  <button
                    onClick={handleConnectGarmin}
                    disabled={garmin.loading}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
                    style={{ background: "#007CC3" }}
                  >
                    {garmin.loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ExternalLink size={14} />
                    )}
                    Connect to Garmin
                  </button>
                </div>
              )}

              {garmin.connection.connected && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                    Your Garmin data is available on the Health & Training page:
                  </p>
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

            {/* n8n Webhooks */}
            <div
              className="rounded-lg p-4 opacity-75"
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        n8n Webhooks
                      </p>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-primary)" }}
                      >
                        Coming Soon
                      </span>
                    </div>
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
