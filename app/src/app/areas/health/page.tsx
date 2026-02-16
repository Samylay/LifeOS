"use client";

import { useState, useEffect } from "react";
import { Heart, Dumbbell, Check, Plus, X, Pencil, RefreshCw, Footprints, Moon, Activity, Loader2, Settings } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useDailyLog } from "@/lib/use-daily-log";
import { useAreaData } from "@/lib/use-area-data";
import { useGarmin } from "@/lib/use-garmin";
import type { GarminActivity } from "@/lib/types";

// --- Types ---

interface Skill {
  name: string;
  current: string;
  target: string;
  progress: number;
}

interface HealthAreaData {
  skills: Skill[];
  jointHealthExercises: string[];
}

const DEFAULT_HEALTH_DATA: HealthAreaData = {
  skills: [
    { name: "Handstand", current: "Wall-assisted 15s", target: "Freestanding 30s", progress: 30 },
    { name: "Pistol Squat", current: "Assisted 3 reps", target: "Unassisted 5 reps", progress: 25 },
    { name: "One-Arm Pushup", current: "Not started", target: "3 reps each side", progress: 0 },
  ],
  jointHealthExercises: ["Bird-dogs", "Glute bridges", "Planks", "Hip circles", "Shoulder dislocates"],
};

// --- Helpers ---

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

function formatSleepDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- Bodyweight Skill Tracker (Editable + Persisted) ---

function SkillTracker({ skills, onUpdate }: { skills: Skill[]; onUpdate: (skills: Skill[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const handleProgressChange = (idx: number, progress: number) => {
    const updated = [...skills];
    updated[idx] = { ...updated[idx], progress: Math.min(100, Math.max(0, progress)) };
    onUpdate(updated);
  };

  const handleEditSave = (idx: number, current: string) => {
    const updated = [...skills];
    updated[idx] = { ...updated[idx], current };
    onUpdate(updated);
    setEditing(null);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    onUpdate([...skills, { name: newName.trim(), current: "Not started", target: newTarget.trim() || "TBD", progress: 0 }]);
    setNewName("");
    setNewTarget("");
    setShowAdd(false);
  };

  const handleRemove = (idx: number) => {
    onUpdate(skills.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Bodyweight Skills</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
          <Plus size={14} />
        </button>
      </div>
      {showAdd && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Skill name..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <input type="text" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="Target..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <button onClick={handleAdd} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
        </div>
      )}
      <div className="space-y-3">
        {skills.map((skill, idx) => (
          <div key={skill.name + idx} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{skill.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: "#14B8A6" }}>{skill.progress}%</span>
                <button onClick={() => handleRemove(idx)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
                  <X size={10} />
                </button>
              </div>
            </div>
            <input type="range" min={0} max={100} value={skill.progress}
              onChange={(e) => handleProgressChange(idx, parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: "#14B8A6" }} />
            <div className="flex justify-between mt-1">
              {editing === idx ? (
                <input type="text" defaultValue={skill.current} autoFocus
                  className="text-xs bg-transparent outline-none flex-1 mr-2 rounded px-1"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--accent)" }}
                  onBlur={(e) => handleEditSave(idx, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEditSave(idx, (e.target as HTMLInputElement).value)} />
              ) : (
                <button onClick={() => setEditing(idx)} className="text-xs flex items-center gap-1 hover:opacity-80"
                  style={{ color: "var(--text-tertiary)" }}>
                  {skill.current} <Pencil size={8} />
                </button>
              )}
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{skill.target}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Joint Health Checklist (Persisted daily) ---

function JointHealthChecklist({ exercises, onUpdateExercises }: {
  exercises: string[];
  onUpdateExercises: (exercises: string[]) => void;
}) {
  const todayKey = new Date().toISOString().split("T")[0];
  const storageKey = `jointHealth_${todayKey}`;

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return Object.fromEntries(exercises.map((e) => [e, false]));
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newExercise, setNewExercise] = useState("");

  const toggle = (name: string) => {
    const updated = { ...checks, [name]: !checks[name] };
    setChecks(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
  };

  const addExercise = () => {
    if (!newExercise.trim()) return;
    const name = newExercise.trim();
    onUpdateExercises([...exercises, name]);
    setChecks((prev) => ({ ...prev, [name]: false }));
    setNewExercise("");
    setShowAdd(false);
  };

  const removeExercise = (name: string) => {
    onUpdateExercises(exercises.filter((e) => e !== name));
    setChecks((prev) => {
      const updated = { ...prev };
      delete updated[name];
      return updated;
    });
  };

  const completed = exercises.filter((e) => checks[e]).length;
  const total = exercises.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Joint Health</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: completed === total ? "#14B8A6" : "var(--text-tertiary)" }}>
            {completed}/{total}
          </span>
          <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
            <Plus size={12} />
          </button>
        </div>
      </div>
      {showAdd && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={newExercise} onChange={(e) => setNewExercise(e.target.value)} placeholder="Exercise..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus
            onKeyDown={(e) => e.key === "Enter" && addExercise()} />
          <button onClick={addExercise} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
        </div>
      )}
      <div className="space-y-2">
        {exercises.map((name) => (
          <div key={name} className="group flex items-center gap-2">
            <button
              onClick={() => toggle(name)}
              className="flex items-center gap-2 flex-1 text-left rounded-lg px-3 py-2 transition-colors"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div
                className="shrink-0 h-4 w-4 rounded flex items-center justify-center"
                style={{ border: checks[name] ? "none" : "1.5px solid var(--text-tertiary)", background: checks[name] ? "#14B8A6" : "transparent" }}
              >
                {checks[name] && <Check size={10} className="text-white" />}
              </div>
              <span className="text-sm" style={{ color: "var(--text-primary)", textDecoration: checks[name] ? "line-through" : "none", opacity: checks[name] ? 0.6 : 1 }}>
                {name}
              </span>
            </button>
            <button onClick={() => removeExercise(name)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Garmin Activity Card ---

function GarminActivityCard({ activity }: { activity: GarminActivity }) {
  const date = new Date(activity.startTimeLocal);
  const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: "#007CC320", color: "#007CC3" }}>
            {formatActivityType(activity.activityType)}
          </span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {dateStr} {timeStr}
          </span>
        </div>
      </div>
      <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        {activity.activityName}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
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
}

// --- Garmin Activities List ---

function GarminActivities({ activities, syncing, onSync, connected }: {
  activities: GarminActivity[];
  syncing: boolean;
  onSync: () => void;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Recent Activities</h3>
        <div className="text-center py-6">
          <Dumbbell size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Connect Garmin in Settings to see your activities here.
          </p>
          <a href="/settings" className="inline-flex items-center gap-1 text-xs mt-2 hover:opacity-80" style={{ color: "#007CC3" }}>
            <Settings size={10} /> Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Recent Activities</h3>
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
          style={{ color: "#007CC3" }}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Sync
        </button>
      </div>
      {activities.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {syncing ? "Fetching activities..." : "No activities yet. Hit Sync to fetch from Garmin."}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {activities.map((a) => (
            <GarminActivityCard key={a.activityId} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Garmin Health Metrics ---

function GarminHealthMetrics({ dailySummary, syncing, onSync, connected }: {
  dailySummary: ReturnType<typeof useGarmin>["dailySummary"];
  syncing: boolean;
  onSync: () => void;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Health Metrics</h3>
        <div className="text-center py-6">
          <Activity size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Connect Garmin in Settings to see health data here.
          </p>
        </div>
      </div>
    );
  }

  const steps = dailySummary?.steps || 0;
  const hr = dailySummary?.heartRate;
  const sleep = dailySummary?.sleep;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Health Metrics</h3>
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
          style={{ color: "#007CC3" }}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Sync
        </button>
      </div>

      {!dailySummary ? (
        <div className="text-center py-4">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {syncing ? "Fetching health data..." : "Hit Sync to fetch today's health metrics."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Steps */}
          <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: "var(--bg-tertiary)" }}>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg" style={{ background: "#14B8A620" }}>
              <Footprints size={16} style={{ color: "#14B8A6" }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Steps</p>
              <p className="text-lg font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                {steps.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Heart Rate */}
          {hr && (
            <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Heart size={14} style={{ color: "#ef4444" }} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Heart Rate</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Resting</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {hr.restingHeartRate || "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Min</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {hr.minHeartRate || "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Max</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {hr.maxHeartRate || "--"}
                  </p>
                </div>
              </div>
              {hr.lastSevenDaysAvgRestingHeartRate > 0 && (
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  7-day avg resting: <span className="font-mono font-semibold">{hr.lastSevenDaysAvgRestingHeartRate}</span> bpm
                </p>
              )}
            </div>
          )}

          {/* Sleep */}
          {sleep && (
            <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Moon size={14} style={{ color: "#8B5CF6" }} />
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sleep</span>
                </div>
                {sleep.sleepScore > 0 && (
                  <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: "#8B5CF620", color: "#8B5CF6" }}>
                    Score: {sleep.sleepScore}
                  </span>
                )}
              </div>
              <p className="text-lg font-mono font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {formatSleepDuration(sleep.sleepTimeSeconds)}
              </p>
              {/* Sleep stages bar */}
              {sleep.sleepTimeSeconds > 0 && (
                <div className="mb-2">
                  <div className="flex h-2 rounded-full overflow-hidden">
                    <div style={{ width: `${(sleep.deepSleepSeconds / sleep.sleepTimeSeconds) * 100}%`, background: "#3B82F6" }} />
                    <div style={{ width: `${(sleep.lightSleepSeconds / sleep.sleepTimeSeconds) * 100}%`, background: "#93C5FD" }} />
                    <div style={{ width: `${(sleep.remSleepSeconds / sleep.sleepTimeSeconds) * 100}%`, background: "#8B5CF6" }} />
                    <div style={{ width: `${(sleep.awakeSleepSeconds / sleep.sleepTimeSeconds) * 100}%`, background: "#F59E0B" }} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#3B82F6" }} /> Deep {formatSleepDuration(sleep.deepSleepSeconds)}
                    </span>
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#93C5FD" }} /> Light {formatSleepDuration(sleep.lightSleepSeconds)}
                    </span>
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#8B5CF6" }} /> REM {formatSleepDuration(sleep.remSleepSeconds)}
                    </span>
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#F59E0B" }} /> Awake {formatSleepDuration(sleep.awakeSleepSeconds)}
                    </span>
                  </div>
                </div>
              )}
              {/* Extra sleep metrics */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {sleep.restingHeartRate > 0 && (
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Resting HR</p>
                    <p className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{sleep.restingHeartRate}</p>
                  </div>
                )}
                {sleep.avgOvernightHrv > 0 && (
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>HRV</p>
                    <p className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{Math.round(sleep.avgOvernightHrv)} ms</p>
                  </div>
                )}
                {sleep.bodyBatteryChange !== 0 && (
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Body Battery</p>
                    <p className="text-xs font-mono font-semibold" style={{ color: sleep.bodyBatteryChange > 0 ? "#14B8A6" : "#ef4444" }}>
                      {sleep.bodyBatteryChange > 0 ? "+" : ""}{sleep.bodyBatteryChange}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Wellbeing Pulse ---

function WellbeingPulse() {
  const { log } = useDailyLog();
  const items = [
    { label: "Sleep", value: log?.sleepQuality },
    { label: "Energy", value: log?.energy },
    { label: "Mood", value: log?.mood },
  ];

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Wellbeing Pulse</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between mb-1">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.label}</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "#14B8A6" }}>
                {item.value ? `${item.value}/5` : "--"}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: item.value ? `${(item.value / 5) * 100}%` : "0%", background: "#14B8A6" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function HealthAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();
  const { notes, createNote, deleteNote } = useNotes();
  const { log } = useDailyLog();
  const { data, updateData } = useAreaData("health", DEFAULT_HEALTH_DATA);
  const garmin = useGarmin();

  // Auto-sync Garmin data when connected
  useEffect(() => {
    if (garmin.connection.connected) {
      garmin.syncAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin.connection.connected]);

  const healthNotes = notes
    .filter((n) => n.area === "health")
    .map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt }));

  // Compute metrics from real data
  const healthHabits = habits.filter((h) => h.area === "health");
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const trainingThisWeek = garmin.connection.connected
    ? garmin.activities.filter((a) => {
        const actDate = new Date(a.startTimeLocal).toISOString().split("T")[0];
        return actDate >= weekStartStr;
      }).length
    : healthHabits.reduce((count, h) => {
        return count + h.history.filter((entry) => entry.date >= weekStartStr && entry.completed).length;
      }, 0);

  const sleepDisplay = garmin.dailySummary?.sleep
    ? formatSleepDuration(garmin.dailySummary.sleep.sleepTimeSeconds)
    : log?.sleepQuality ? `${log.sleepQuality}/5` : "--";

  const stepsDisplay = garmin.dailySummary?.steps
    ? garmin.dailySummary.steps.toLocaleString()
    : "--";

  return (
    <AreaModule
      icon={<Heart size={24} />}
      title="Health & Training"
      color="#14B8A6"
      areaId="health"
      metrics={[
        { label: "Training this week", value: `${trainingThisWeek}`, color: "#14B8A6" },
        { label: garmin.connection.connected ? "Sleep (last night)" : "Sleep quality", value: sleepDisplay, color: "#14B8A6" },
        { label: "Steps today", value: stepsDisplay, color: "#14B8A6" },
      ]}
      tasks={tasks}
      onTaskUpdate={updateTask}
      onTaskDelete={deleteTask}
      onTaskCreate={createTask}
      habits={habits}
      onHabitToggle={toggleToday}
      onHabitCreate={createHabit}
      onHabitDelete={deleteHabit}
      notes={healthNotes}
      onNoteAdd={(content) => createNote({ content, area: "health", tags: [], processed: false })}
      onNoteDelete={deleteNote}
    >
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SkillTracker skills={data.skills} onUpdate={(skills) => updateData({ skills })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <JointHealthChecklist exercises={data.jointHealthExercises} onUpdateExercises={(jointHealthExercises) => updateData({ jointHealthExercises })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <GarminActivities
          activities={garmin.activities}
          syncing={garmin.syncing}
          onSync={() => garmin.syncActivities(0, 10)}
          connected={garmin.connection.connected}
        />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <GarminHealthMetrics
          dailySummary={garmin.dailySummary}
          syncing={garmin.syncing}
          onSync={() => garmin.syncHealth()}
          connected={garmin.connection.connected}
        />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <WellbeingPulse />
      </div>
    </AreaModule>
  );
}
