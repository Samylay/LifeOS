"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { useJourneys } from "@/lib/use-journeys";
import {
  AREAS,
  TIER_NAMES,
  TIER_THRESHOLDS,
  progressToNextTier,
  type JourneyTier,
} from "@/lib/types";
import { TierUpCelebration } from "@/components/tier-up-celebration";
import { useState } from "react";

export default function JourneyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { journeys, updateJourney, addHours, deleteJourney, tierUp, dismissTierUp } =
    useJourneys();
  const [hoursToAdd, setHoursToAdd] = useState("1");

  const journey = journeys.find((j) => j.id === params.id);
  if (!journey) {
    return (
      <div>
        <Link
          href="/journeys"
          className="text-sm flex items-center gap-1 mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={14} /> Back to Journeys
        </Link>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Journey not found.
        </p>
      </div>
    );
  }

  const tierName = TIER_NAMES[journey.currentTier - 1];
  const { current, next, pct } = progressToNextTier(journey.totalHours);

  return (
    <div>
      <Link
        href="/journeys"
        className="text-sm flex items-center gap-1 mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} /> Back to Journeys
      </Link>

      <div className="mb-2">
        <p
          className="text-xs font-mono uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          Journey · {AREAS[journey.area]?.name}
        </p>
        <h1 className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {journey.title}
        </h1>
        {journey.description && (
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {journey.description}
          </p>
        )}
      </div>

      <div
        className="rounded-xl p-5 my-6"
        style={{ background: "var(--accent)", color: "white" }}
      >
        <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-80">
          Current Tier · {journey.currentTier}
        </p>
        <p className="text-3xl font-bold leading-tight">{tierName}</p>
        {journey.currentTier < 7 ? (
          <>
            <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-80 mt-2">
              {Math.round(journey.totalHours - current)} / {next - current}h to{" "}
              {TIER_NAMES[journey.currentTier]}
            </p>
            <div
              className="mt-2 h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "white" }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-80 mt-2">
            Grandmaster · max tier
          </p>
        )}
      </div>

      {/* Quick add hours (manual log) */}
      <div
        className="rounded-xl p-4 mb-6 flex items-center gap-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Log hours manually:
        </span>
        <input
          type="number"
          min="0"
          step="0.25"
          value={hoursToAdd}
          onChange={(e) => setHoursToAdd(e.target.value)}
          className="w-20 text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        />
        <button
          onClick={() => {
            const h = Number(hoursToAdd) || 0;
            if (h > 0) addHours(journey.id, h);
          }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500"
        >
          <Plus size={12} /> Add hours
        </button>
        <div className="flex-1" />
        <button
          onClick={() => updateJourney(journey.id, { isActive: !journey.isActive })}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          {journey.isActive ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => {
            if (confirm("Delete this journey?")) {
              deleteJourney(journey.id);
              router.push("/journeys");
            }
          }}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: "#EF4444" }}
        >
          Delete
        </button>
      </div>

      <p
        className="text-xs font-mono uppercase tracking-wider mb-2"
        style={{ color: "var(--text-tertiary)" }}
      >
        Tiers
      </p>
      <div className="space-y-2">
        {(Array.from({ length: 7 }, (_, i) => 7 - i) as JourneyTier[]).map((tier) => {
          const state =
            tier < journey.currentTier
              ? "done"
              : tier === journey.currentTier
              ? "current"
              : "future";
          return (
            <div key={tier} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{
                  background:
                    state === "current"
                      ? "var(--accent)"
                      : state === "done"
                      ? "var(--text-primary)"
                      : "var(--bg-tertiary)",
                  color:
                    state === "future"
                      ? "var(--text-tertiary)"
                      : state === "done"
                      ? "var(--bg-primary)"
                      : "white",
                  border: "1.5px solid var(--border-primary)",
                }}
              >
                {state === "done" ? <Check size={14} /> : tier}
              </div>
              <div
                className="flex-1 rounded-lg px-3 py-2 flex items-center justify-between"
                style={{
                  background:
                    state === "current"
                      ? "var(--accent-bg)"
                      : "var(--bg-secondary)",
                  border: "1px solid var(--border-primary)",
                  opacity: state === "future" ? 0.5 : 1,
                }}
              >
                <span
                  className="text-sm"
                  style={{
                    color: "var(--text-primary)",
                    fontWeight: state === "current" ? 600 : 400,
                  }}
                >
                  {TIER_NAMES[tier - 1]}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {TIER_THRESHOLDS[tier - 1].toLocaleString()}h
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {tierUp && <TierUpCelebration event={tierUp} onClose={dismissTierUp} />}
    </div>
  );
}
