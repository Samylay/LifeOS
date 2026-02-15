import { Megaphone } from "lucide-react";

export default function BrandAreaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Megaphone size={24} style={{ color: "#8B5CF6" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Personal Brand</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: "3px solid #8B5CF6",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Posts this week</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#8B5CF6" }}>0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Mailing list subs</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#8B5CF6" }}>0</span>
            </div>
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Content Calendar</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No content planned yet.</p>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Ideas Backlog</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Capture content ideas with the capture bar.</p>
        </div>
      </div>
    </div>
  );
}
