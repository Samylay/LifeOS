"use client";

import { useState } from "react";
import { Sword, Plus, Trash2, Clock, Trophy } from "lucide-react";
import { useJourneys } from "@/lib/use-journeys";
import { AREAS, TIER_NAMES, TIER_HOURS } from "@/lib/types";
import type { AreaId, JourneyTier } from "@/lib/types";

const TIER_COLORS: Record<JourneyTier, string> = {
  1: "#64748B", 2: "#3B82F6", 3: "#10B981", 4: "#F59E0B", 5: "#8B5CF6", 6: "#EF4444", 7: "#F59E0B",
};

function JourneyCreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: { title: string; area: AreaId; description?: string; tags: string[]; isActive: boolean }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaId>("career");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), area, description: description.trim() || undefined, tags: [], isActive: true });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Journey title (e.g. 'TypeScript Mastery')..."
        autoFocus className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />
      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)..."
        className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Area</label>
          <select value={area} onChange={(e) => setArea(e.target.value as AreaId)}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            {Object.entries(AREAS).map(([id, a]) => <option key={id} value={id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium">Start Journey</button>
      </div>
    </form>
  );
}

function JourneyCard({ journey, onAddHours, onUpdate, onDelete }: {
  journey: { id: string; title: string; area: AreaId; description?: string; totalHours: number; currentTier: JourneyTier; isActive: boolean; tags: string[]; createdAt: Date; tierHistory: { tier: JourneyTier; reachedAt: Date }[] };
  onAddHours: (id: string, hours: number) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const [hoursInput, setHoursInput] = useState("1");

  const nextTier = (journey.currentTier < 7 ? journey.currentTier + 1 : 7) as JourneyTier;
  const nextThreshold = TIER_HOURS[nextTier];
  const currentThreshold = TIER_HOURS[journey.currentTier];
  const progressInTier = journey.currentTier < 7
    ? ((journey.totalHours - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;

  const AREA_COLORS: Record<string, string> = {
    health: "#14B8A6", career: "#6366F1", finance: "#F59E0B", brand: "#8B5CF6", admin: "#64748B",
  };

  return (
    <div className="rounded-xl p-5 group" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{journey.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: `${AREA_COLORS[journey.area]}15`, color: AREA_COLORS[journey.area] }}>
              {AREAS[journey.area]?.name}
            </span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ background: `${TIER_COLORS[journey.currentTier]}20`, color: TIER_COLORS[journey.currentTier] }}>
              {TIER_NAMES[journey.currentTier]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onUpdate(journey.id, { isActive: !journey.isActive })}
            className="text-xs px-2 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            style={{ color: journey.isActive ? "#F59E0B" : "#10B981" }}>
            {journey.isActive ? "Pause" : "Resume"}
          </button>
          <button onClick={() => onDelete(journey.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1" style={{ color: "var(--text-tertiary)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {journey.description && (
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{journey.description}</p>
      )}

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold font-mono" style={{ color: TIER_COLORS[journey.currentTier] }}>
          {journey.totalHours.toFixed(1)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>/ 10,000 hours</span>
      </div>

      <div className="mb-1">
        <div className="flex justify-between mb-1">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {TIER_NAMES[journey.currentTier]} → {journey.currentTier < 7 ? TIER_NAMES[nextTier] : "Max"}
          </span>
          <span className="text-xs font-mono" style={{ color: TIER_COLORS[journey.currentTier] }}>
            {Math.min(100, progressInTier).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progressInTier)}%`, background: TIER_COLORS[journey.currentTier] }} />
        </div>
      </div>

      {showLog ? (
        <div className="flex items-center gap-2 mt-3">
          <input type="number" value={hoursInput} onChange={(e) => setHoursInput(e.target.value)}
            min="0.25" step="0.25" className="w-20 text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>hours</span>
          <button onClick={() => { onAddHours(journey.id, parseFloat(hoursInput) || 0); setShowLog(false); setHoursInput("1"); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white">Log</button>
          <button onClick={() => setShowLog(false)} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
            <Clock size={12} />
            {journey.currentTier < 7 ? `${(nextThreshold - journey.totalHours).toFixed(0)}h to ${TIER_NAMES[nextTier]}` : "Grandmaster reached"}
          </span>
          <button onClick={() => setShowLog(true)}
            className="text-xs px-3 py-1 rounded-lg transition-colors" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
            Log Hours
          </button>
        </div>
      )}
    </div>
  );
}

export default function JourneysPage() {
  const { journeys, activeJourneys, loading, createJourney, addHours, updateJourney, deleteJourney } = useJourneys();
  const [showForm, setShowForm] = useState(false);

  const inactive = journeys.filter((j) => !j.isActive);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Hero Journeys</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <Plus size={16} /> New Journey
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <JourneyCreateForm onSubmit={(data) => { createJourney(data); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {journeys.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Sword size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No hero journeys yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Start a journey to track your long-term mastery toward 10,000 hours.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Tier legend */}
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5, 6, 7] as JourneyTier[]).map((t) => (
              <span key={t} className="text-xs px-2 py-1 rounded-lg" style={{ background: `${TIER_COLORS[t]}15`, color: TIER_COLORS[t] }}>
                {TIER_NAMES[t]} ({TIER_HOURS[t].toLocaleString()}h)
              </span>
            ))}
          </div>

          {activeJourneys.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>Active ({activeJourneys.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeJourneys.map((j) => <JourneyCard key={j.id} journey={j} onAddHours={addHours} onUpdate={updateJourney} onDelete={deleteJourney} />)}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Paused ({inactive.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                {inactive.map((j) => <JourneyCard key={j.id} journey={j} onAddHours={addHours} onUpdate={updateJourney} onDelete={deleteJourney} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
