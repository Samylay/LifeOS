import { Target, Plus } from "lucide-react";

export default function QuestsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Quests
        </h1>
        <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <Plus size={16} />
          New Quest
        </button>
      </div>

      <div
        className="flex flex-col items-center justify-center py-16 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <Target size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          No quests yet
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Create 90-day quests to stay focused on what matters.
        </p>
      </div>
    </div>
  );
}
