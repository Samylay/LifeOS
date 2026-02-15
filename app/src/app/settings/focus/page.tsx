export default function FocusSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Focus Settings
      </h1>

      <div className="space-y-6 max-w-2xl">
        {/* Timer Defaults */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Timer Defaults
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Configure your default Pomodoro durations and preferences.
          </p>
        </div>

        {/* Focus Shield */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Focus Shield
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Configure distraction blocking during focus sessions. Coming in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}
