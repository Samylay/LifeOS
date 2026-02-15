import { Briefcase } from "lucide-react";

export default function CareerAreaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Briefcase size={24} style={{ color: "#6366F1" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Career & Learning
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: "3px solid #6366F1",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Learning hours this week</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#6366F1" }}>0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>JECT projects</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#6366F1" }}>0</span>
            </div>
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Skill Tree</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Coming in Phase 2.</p>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Active Tasks</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No career tasks yet.</p>
        </div>
      </div>
    </div>
  );
}
