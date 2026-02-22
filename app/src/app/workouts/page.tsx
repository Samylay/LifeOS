"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dumbbell,
  Plus,
  X,
  Clock,
  Flame,
  Star,
  ChevronDown,
  Trash2,
  Calendar,
  RefreshCw,
  Loader2,
  Watch,
} from "lucide-react";
import { useWorkouts } from "@/lib/use-workouts";
import { useGarmin } from "@/lib/use-garmin";
import type {
  Workout,
  WorkoutExercise,
  WorkoutSet,
  MuscleGroup,
  GarminActivity,
  DEFAULT_EXERCISES,
} from "@/lib/types";
import { DEFAULT_EXERCISES as EXERCISES } from "@/lib/types";

const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: "#EF4444",
  back: "#3B82F6",
  shoulders: "#F59E0B",
  biceps: "#8B5CF6",
  triceps: "#EC4899",
  legs: "#7C9E8A",
  core: "#F97316",
  cardio: "#06B6D4",
  flexibility: "#14B8A6",
  full_body: "#6366F1",
};

// --- Garmin helpers (same as health page) ---

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

// --- Unified timeline types ---

type HistoryEntry =
  | { type: "manual"; date: Date; workout: Workout }
  | { type: "garmin"; date: Date; activity: GarminActivity };

function RatingStars({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)}>
          <Star
            size={18}
            fill={value && n <= value ? "#F59E0B" : "none"}
            style={{ color: value && n <= value ? "#F59E0B" : "var(--text-tertiary)" }}
          />
        </button>
      ))}
    </div>
  );
}

function WorkoutForm({
  onSave,
  onCancel,
}: {
  onSave: (data: Omit<Workout, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(
    `Workout - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  );
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [rating, setRating] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [filterGroup, setFilterGroup] = useState<MuscleGroup | "all">("all");

  const addExercise = (ex: { id: string; name: string }) => {
    setExercises((prev) => [
      ...prev,
      {
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: [{ reps: undefined, weight: undefined }],
      },
    ]);
    setShowExercisePicker(false);
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIdx
          ? { ...e, sets: [...e.sets, { reps: undefined, weight: undefined }] }
          : e
      )
    );
  };

  const updateSet = (exIdx: number, setIdx: number, field: keyof WorkoutSet, value: number) => {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIdx
          ? {
              ...e,
              sets: e.sets.map((s, si) =>
                si === setIdx ? { ...s, [field]: value } : s
              ),
            }
          : e
      )
    );
  };

  const removeExercise = (idx: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIdx
          ? { ...e, sets: e.sets.filter((_, si) => si !== setIdx) }
          : e
      )
    );
  };

  const filteredExercises =
    filterGroup === "all"
      ? EXERCISES
      : EXERCISES.filter((e) => e.muscleGroup === filterGroup);

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--accent)",
      }}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-lg font-semibold bg-transparent outline-none mb-4"
        style={{ color: "var(--text-primary)" }}
      />

      {/* Exercises */}
      <div className="space-y-4 mb-4">
        {exercises.map((ex, exIdx) => (
          <div
            key={exIdx}
            className="rounded-lg p-3"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {ex.exerciseName}
              </span>
              <button
                onClick={() => removeExercise(exIdx)}
                style={{ color: "var(--text-tertiary)" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Sets table */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <span>Set</span>
                <span>Reps</span>
                <span>Weight (kg)</span>
                <span></span>
              </div>
              {ex.sets.map((set, setIdx) => (
                <div key={setIdx} className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {setIdx + 1}
                  </span>
                  <input
                    type="number"
                    placeholder="--"
                    value={set.reps ?? ""}
                    onChange={(e) =>
                      updateSet(exIdx, setIdx, "reps", parseInt(e.target.value) || 0)
                    }
                    className="text-sm rounded px-2 py-1.5 bg-transparent outline-none text-center"
                    style={{
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <input
                    type="number"
                    placeholder="--"
                    value={set.weight ?? ""}
                    onChange={(e) =>
                      updateSet(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)
                    }
                    className="text-sm rounded px-2 py-1.5 bg-transparent outline-none text-center"
                    style={{
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    onClick={() => removeSet(exIdx, setIdx)}
                    className="p-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addSet(exIdx)}
              className="text-xs mt-2 px-2 py-1 rounded"
              style={{ color: "var(--accent)" }}
            >
              + Add Set
            </button>
          </div>
        ))}
      </div>

      {/* Add exercise */}
      {showExercisePicker ? (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setFilterGroup("all")}
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: filterGroup === "all" ? "var(--accent)" : "var(--bg-secondary)",
                color: filterGroup === "all" ? "white" : "var(--text-secondary)",
              }}
            >
              All
            </button>
            {(Object.keys(MUSCLE_COLORS) as MuscleGroup[]).map((group) => (
              <button
                key={group}
                onClick={() => setFilterGroup(group)}
                className="text-xs px-2 py-1 rounded-full capitalize"
                style={{
                  background: filterGroup === group ? MUSCLE_COLORS[group] : "var(--bg-secondary)",
                  color: filterGroup === group ? "white" : "var(--text-secondary)",
                }}
              >
                {group.replace("_", " ")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
            {filteredExercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => addExercise(ex)}
                className="text-left text-sm rounded-lg px-3 py-2 transition-colors"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                {ex.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowExercisePicker(false)}
            className="text-xs mt-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowExercisePicker(true)}
          className="flex items-center gap-1.5 text-sm font-medium mb-4"
          style={{ color: "var(--accent)" }}
        >
          <Plus size={14} /> Add Exercise
        </button>
      )}

      {/* Rating & Notes */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          How did it feel?
        </span>
        <RatingStars value={rating} onChange={setRating} />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Workout notes..."
        rows={2}
        className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none mb-4"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
        }}
      />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-sm px-4 py-2 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              title,
              date: new Date(),
              exercises,
              rating,
              notes: notes || undefined,
            })
          }
          className="text-sm px-4 py-2 rounded-lg bg-sage-400 text-white font-medium hover:bg-sage-500 transition-colors"
        >
          Save Workout
        </button>
      </div>
    </div>
  );
}

export default function WorkoutsPage() {
  const {
    workouts,
    thisWeek,
    thisMonth,
    loading,
    createWorkout,
    deleteWorkout,
  } = useWorkouts();
  const garmin = useGarmin();
  const [showForm, setShowForm] = useState(false);

  // Auto-sync Garmin activities on mount
  useEffect(() => {
    if (garmin.connection.connected) {
      garmin.syncActivities(0, 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin.connection.connected]);

  // Build unified timeline: manual workouts + Garmin activities, sorted newest first
  const history = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [];

    for (const w of workouts) {
      entries.push({ type: "manual", date: new Date(w.date), workout: w });
    }

    for (const a of garmin.activities) {
      entries.push({ type: "garmin", date: new Date(a.startTimeLocal), activity: a });
    }

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  }, [workouts, garmin.activities]);

  // Stats: include Garmin activities in weekly/monthly counts
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const garminThisWeek = garmin.activities.filter(
    (a) => new Date(a.startTimeLocal) >= weekStart
  );
  const garminThisMonth = garmin.activities.filter(
    (a) => new Date(a.startTimeLocal) >= monthStart
  );

  const totalWeek = thisWeek.length + garminThisWeek.length;
  const totalMonth = thisMonth.length + garminThisMonth.length;

  const totalVolume = thisWeek.reduce((sum, w) => {
    return (
      sum +
      w.exercises.reduce(
        (eSum, ex) =>
          eSum + ex.sets.reduce((sSum, s) => sSum + (s.reps || 0) * (s.weight || 0), 0),
        0
      )
    );
  }, 0);

  const totalCalories = garminThisWeek.reduce((sum, a) => sum + (a.calories || 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Dumbbell size={24} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Workouts
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {garmin.connection.connected && (
            <button
              onClick={() => garmin.syncActivities(0, 20)}
              disabled={garmin.syncing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "#007CC3" }}
            >
              {garmin.syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={16} />
            Log Workout
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
            {totalWeek}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            This week
          </p>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
            {totalMonth}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            This month
          </p>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>
            {totalCalories > 0 ? totalCalories.toLocaleString() : Math.round(totalVolume)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {totalCalories > 0 ? "Calories (week)" : "Volume (kg)"}
          </p>
        </div>
      </div>

      {/* New workout form */}
      {showForm && (
        <div className="mb-6">
          <WorkoutForm
            onSave={async (data) => {
              await createWorkout(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Unified history */}
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        History
      </h2>
      {history.length === 0 && !loading && !garmin.syncing && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <Dumbbell size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No workouts yet. Log a workout or connect Garmin in Settings.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {history.map((entry) =>
          entry.type === "manual" ? (
            <div
              key={`manual-${entry.workout.id}`}
              className="group rounded-xl p-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {entry.workout.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      <Calendar size={10} />
                      {entry.date.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {entry.workout.exercises.length} exercise{entry.workout.exercises.length !== 1 ? "s" : ""}
                    </span>
                    {entry.workout.rating && (
                      <span className="flex items-center gap-0.5 text-xs" style={{ color: "#F59E0B" }}>
                        <Star size={10} fill="#F59E0B" />
                        {entry.workout.rating}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteWorkout(entry.workout.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entry.workout.exercises.map((ex, i) => {
                  const exercise = EXERCISES.find((e) => e.id === ex.exerciseId);
                  const group = exercise?.muscleGroup || "full_body";
                  return (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${MUSCLE_COLORS[group]}15`,
                        color: MUSCLE_COLORS[group],
                      }}
                    >
                      {ex.exerciseName} ({ex.sets.length}x)
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              key={`garmin-${entry.activity.activityId}`}
              className="rounded-xl p-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ background: "#007CC320", color: "#007CC3" }}
                    >
                      {formatActivityType(entry.activity.activityType)}
                    </span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      <Watch size={10} />
                      Garmin
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {entry.activity.activityName}
                  </h3>
                  <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    <Calendar size={10} />
                    {entry.date.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {entry.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {entry.activity.duration > 0 && (
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {formatDuration(entry.activity.duration)}
                  </span>
                )}
                {entry.activity.distance > 0 && (
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {formatDistance(entry.activity.distance)}
                  </span>
                )}
                {entry.activity.calories > 0 && (
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {entry.activity.calories} cal
                  </span>
                )}
                {entry.activity.averageHR > 0 && (
                  <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
                    {Math.round(entry.activity.averageHR)} bpm avg
                  </span>
                )}
                {entry.activity.maxHR > 0 && (
                  <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
                    {Math.round(entry.activity.maxHR)} bpm max
                  </span>
                )}
                {entry.activity.elevationGain > 0 && (
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    +{Math.round(entry.activity.elevationGain)} m elev
                  </span>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
