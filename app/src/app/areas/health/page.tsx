"use client";

import { useState } from "react";
import { Heart, Dumbbell, Check, Plus, X, Pencil } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useDailyLog } from "@/lib/use-daily-log";
import { useAreaData } from "@/lib/use-area-data";

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

// --- Training Log ---

function TrainingLog() {
  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Training Log</h3>
      <div className="text-center py-6">
        <Dumbbell size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          No training sessions logged yet. Garmin integration coming in Phase 6.
        </p>
      </div>
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

  const healthNotes = notes
    .filter((n) => n.area === "health")
    .map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt }));

  // Compute metrics from real data
  const healthHabits = habits.filter((h) => h.area === "health");
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const trainingThisWeek = healthHabits.reduce((count, h) => {
    return count + h.history.filter((entry) => entry.date >= weekStartStr && entry.completed).length;
  }, 0);

  const sleepAvg = log?.sleepQuality ? `${log.sleepQuality}/5` : "--";

  return (
    <AreaModule
      icon={<Heart size={24} />}
      title="Health & Training"
      color="#14B8A6"
      areaId="health"
      metrics={[
        { label: "Training this week", value: `${trainingThisWeek} / 5`, color: "#14B8A6" },
        { label: "Sleep quality (today)", value: sleepAvg, color: "#14B8A6" },
        { label: "Bodyweight skills", value: `${data.skills.length} tracked`, color: "#14B8A6" },
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
        <TrainingLog />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <WellbeingPulse />
      </div>
    </AreaModule>
  );
}
