"use client";

import { useState } from "react";
import Link from "next/link";
import { Mountain, Plus, Trash2 } from "lucide-react";
import { useJourneys } from "@/lib/use-journeys";
import { TierUpCelebration } from "@/components/tier-up-celebration";
import {
  AREAS,
  TIER_NAMES,
  progressToNextTier,
  type AreaId,
  type Journey,
} from "@/lib/types";

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Parameters<ReturnType<typeof useJourneys>["createJourney"]>[0]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaId>("career");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      area,
      description: description.trim() || undefined,
      totalHours: Math.max(0, Number(hours) || 0),
      tags: [],
      isActive: true,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-4 space-y-3 mb-6"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Journey title (e.g. Web Developer)"
        className="w-full bg-transparent text-sm font-medium outline-none"
        style={{ color: "var(--text-primary)" }}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full bg-transparent text-xs outline-none"
        style={{ color: "var(--text-secondary)" }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as AreaId)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          {Object.entries(AREAS).map(([id, a]) => (
            <option key={id} value={id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
          Starting hours
          <input
            type="number"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-20 text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          />
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="text-xs px-4 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 font-medium"
        >
          Create
        </button>
      </div>
    </form>
  );
}

function JourneyRow({
  journey,
  onDelete,
}: {
  journey: Journey;
  onDelete: (id: string) => void;
}) {
  const tierName = TIER_NAMES[journey.currentTier - 1];
  const { current, next, pct } = progressToNextTier(journey.totalHours);
  const color = AREA_COLORS[journey.area] || "var(--accent)";

  return (
    <Link
      href={`/journeys/${journey.id}`}
      className="block rounded-xl p-4 group transition-all hover:opacity-95"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {journey.title}
        </h3>
        <button
          onClick={(e) => {
            e.preventDefault();
            if (confirm(`Delete journey "${journey.title}"?`)) onDelete(journey.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-mono uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          Tier {journey.currentTier} · {tierName.toUpperCase()}
        </span>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--text-tertiary)" }}
        >
          {Math.round(journey.totalHours)}h total
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {AREAS[journey.area]?.name}
        </span>
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {journey.currentTier < 7
            ? `${Math.round(journey.totalHours - current)} / ${next - current}h to ${TIER_NAMES[journey.currentTier]}`
            : "Max tier"}
        </span>
      </div>
    </Link>
  );
}

export default function JourneysPage() {
  const { journeys, activeJourneys, createJourney, deleteJourney, tierUp, dismissTierUp } =
    useJourneys();
  const [showForm, setShowForm] = useState(false);

  const totalHours = journeys.reduce((sum, j) => sum + j.totalHours, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Journeys
          </h1>
          <p
            className="text-xs font-mono uppercase tracking-wider mt-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            {activeJourneys.length} active · {Math.round(totalHours).toLocaleString()} total hours
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          <Plus size={16} /> New Journey
        </button>
      </div>

      {showForm && (
        <CreateForm
          onSubmit={(data) => {
            createJourney(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {journeys.length === 0 && !showForm ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Mountain size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No journeys yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Track long-term mastery — focus hours add up here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {journeys.map((j) => (
            <JourneyRow key={j.id} journey={j} onDelete={deleteJourney} />
          ))}
        </div>
      )}

      {tierUp && <TierUpCelebration event={tierUp} onClose={dismissTierUp} />}
    </div>
  );
}
