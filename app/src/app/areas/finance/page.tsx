import { DollarSign } from "lucide-react";

export default function FinanceAreaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <DollarSign size={24} style={{ color: "#F59E0B" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Finance</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: "3px solid #F59E0B",
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Monthly Snapshot</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No financial data yet.</p>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Subscriptions</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No subscriptions tracked yet.</p>
        </div>

        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Goals</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No savings goals yet.</p>
        </div>
      </div>
    </div>
  );
}
