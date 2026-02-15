"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user } = useAuth();

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
          <div className="space-y-4">
            {[
              { name: "Google Calendar", status: "Not connected" },
              { name: "Garmin Connect", status: "Phase 2" },
              { name: "n8n Webhooks", status: "Phase 6" },
            ].map((item) => (
              <div key={item.name} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.name}</span>
                <span
                  className="text-xs font-medium px-2 py-1 rounded"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
