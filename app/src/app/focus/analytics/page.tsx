import { BarChart3 } from "lucide-react";

export default function FocusAnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Focus Analytics
      </h1>
      <div
        className="flex flex-col items-center justify-center py-16 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <BarChart3 size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          No focus sessions yet
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Start your first focus session to see your stats appear here.
        </p>
        <button className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          Start Focus Session
        </button>
      </div>
    </div>
  );
}
