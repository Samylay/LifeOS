import { ClipboardList } from "lucide-react";

export default function AdminAreaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList size={24} style={{ color: "#64748B" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Life Admin</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: "3px solid #64748B",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Overdue items</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "var(--danger, #EF4444)" }}>0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Upcoming renewals</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#64748B" }}>0</span>
            </div>
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Admin Inbox</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No admin items yet.</p>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Document Tracker</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No documents tracked yet.</p>
        </div>
      </div>
    </div>
  );
}
