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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="enter flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dumbbell size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold">Training</h1>
        </div>
        {garmin.connection.connected && (
          <button
            onClick={() => garmin.syncActivities(0, 20)}
            disabled={garmin.syncing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#007CC3] transition-transform duration-150 active:scale-[0.97] hover:opacity-80"
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
        <h2 className="mb-3 text-lg font-semibold">Activity timeline</h2>
        {!garmin.connection.connected ? (
          <Card className="p-8 text-center">
            <Watch size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connect Garmin in Settings to see your activity timeline.
            </p>
          </Card>
        ) : activities.length === 0 && !garmin.syncing ? (
          <Card className="p-8 text-center">
            <Dumbbell size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No activities yet. Hit Sync to fetch from Garmin.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => {
              const date = new Date(activity.startTimeLocal);
              return (
                <Card key={activity.activityId} className="hover-lift p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="rounded px-1.5 py-0.5 text-xs font-medium bg-[#007CC320] text-[#007CC3]"
                    >
                      {formatActivityType(activity.activityType)}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Watch size={10} />
                      Garmin
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold">{activity.activityName}</h3>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar size={10} />
                    {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
                    {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {activity.duration > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{formatDuration(activity.duration)}</span>
                    )}
                    {activity.distance > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{formatDistance(activity.distance)}</span>
                    )}
                    {activity.calories > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{activity.calories} cal</span>
                    )}
                    {activity.averageHR > 0 && (
                      <span className="font-mono text-xs text-destructive">{Math.round(activity.averageHR)} bpm avg</span>
                    )}
                    {activity.maxHR > 0 && (
                      <span className="font-mono text-xs text-destructive">{Math.round(activity.maxHR)} bpm max</span>
                    )}
                    {activity.elevationGain > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        +{Math.round(activity.elevationGain)} m elev
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
