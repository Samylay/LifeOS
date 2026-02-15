import { Heart } from "lucide-react";

export default function HealthAreaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Heart size={24} style={{ color: "#14B8A6" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Health & Training
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Key Metrics */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: "3px solid #14B8A6",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
            Key Metrics
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Training this week</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#14B8A6" }}>0 / 5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Sleep quality (7d avg)</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#14B8A6" }}>--</span>
            </div>
          </div>
        </div>

        {/* Habits */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
            Habits
          </h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No habits configured yet.</p>
        </div>

        {/* Active Tasks */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
            Active Tasks
          </h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No health tasks yet.</p>
        </div>
      </div>
    </div>
  );
}
