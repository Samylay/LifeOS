"use client";

import { useEffect } from "react";
import {
  Dumbbell,
  Calendar,
  RefreshCw,
  Loader2,
  Watch,
} from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import TrainingAnalytics from "@/components/training-analytics";
import { StrengthCard } from "@/components/strength-card";

// --- Garmin helpers ---

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatActivityType(typeKey: string): string {
  const map: Record<string, string> = {
    running: "Running",
    street_running: "Running",
    trail_running: "Trail Run",
    treadmill_running: "Treadmill",
    indoor_running: "Indoor Run",
    cycling: "Cycling",
    indoor_cycling: "Indoor Cycling",
    mountain_biking: "MTB",
    walking: "Walking",
    hiking: "Hiking",
    strength_training: "Strength",
    fitness_equipment: "Gym",
    yoga: "Yoga",
    swimming: "Swimming",
    lap_swimming: "Lap Swim",
    open_water_swimming: "Open Water",
    indoor_cardio: "Indoor Cardio",
    hiit: "HIIT",
    breathwork: "Breathwork",
    other: "Other",
  };
  return map[typeKey] || typeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TrainingPage() {
  const garmin = useGarmin();

  // Auto-sync Garmin activities on mount
  useEffect(() => {
    if (garmin.connection.connected) {
      garmin.syncActivities(0, 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin.connection.connected]);

  const activities = [...garmin.activities].sort(
    (a, b) => new Date(b.startTimeLocal).getTime() - new Date(a.startTimeLocal).getTime()
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between enter">
        <div className="flex items-center gap-3">
          <Dumbbell size={24} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Training
          </h1>
        </div>
        {garmin.connection.connected && (
          <button
            onClick={() => garmin.syncActivities(0, 20)}
            disabled={garmin.syncing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97] hover:opacity-80"
            style={{ color: "#007CC3" }}
            aria-label="Sync activities from Garmin"
          >
            {garmin.syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync
          </button>
        )}
      </div>

      {/* Analytics (Strava) */}
      <div className="enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <TrainingAnalytics />
      </div>

      {/* Strength focus (folded in from the retired /strength route) */}
      <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
        <StrengthCard />
      </div>

      {/* Activity timeline (Garmin) */}
      <div className="enter" style={{ ["--enter-delay" as string]: "90ms" }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Activity timeline
        </h2>
        {!garmin.connection.connected ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <Watch size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Connect Garmin in Settings to see your activity timeline.
            </p>
          </div>
        ) : activities.length === 0 && !garmin.syncing ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <Dumbbell size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No activities yet. Hit Sync to fetch from Garmin.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => {
              const date = new Date(activity.startTimeLocal);
              return (
                <div
                  key={activity.activityId}
                  className="rounded-xl p-4 hover-lift"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ background: "#007CC320", color: "#007CC3" }}
                    >
                      {formatActivityType(activity.activityType)}
                    </span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      <Watch size={10} />
                      Garmin
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {activity.activityName}
                  </h3>
                  <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    <Calendar size={10} />
                    {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
                    {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {activity.duration > 0 && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        {formatDuration(activity.duration)}
                      </span>
                    )}
                    {activity.distance > 0 && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        {formatDistance(activity.distance)}
                      </span>
                    )}
                    {activity.calories > 0 && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        {activity.calories} cal
                      </span>
                    )}
                    {activity.averageHR > 0 && (
                      <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
                        {Math.round(activity.averageHR)} bpm avg
                      </span>
                    )}
                    {activity.maxHR > 0 && (
                      <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
                        {Math.round(activity.maxHR)} bpm max
                      </span>
                    )}
                    {activity.elevationGain > 0 && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        +{Math.round(activity.elevationGain)} m elev
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
