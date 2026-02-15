import { Flag } from "lucide-react";

export default function GoalsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Goals — 2026
      </h1>

      <div
        className="flex flex-col items-center justify-center py-16 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <Flag size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          No goals set yet
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Define your annual goals with quarterly milestones.
        </p>
      </div>
    </div>
  );
}
