"use client";

import { useState } from "react";
import { Heart, Dumbbell, Check } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useDailyLog } from "@/lib/use-daily-log";

// --- Bodyweight Skill Tracker ---

interface Skill {
  name: string;
  current: string;
  target: string;
  progress: number;
}

const DEFAULT_SKILLS: Skill[] = [
  { name: "Handstand", current: "Wall-assisted 15s", target: "Freestanding 30s", progress: 30 },
  { name: "Pistol Squat", current: "Assisted 3 reps", target: "Unassisted 5 reps", progress: 25 },
  { name: "One-Arm Pushup", current: "Not started", target: "3 reps each side", progress: 0 },
];

function SkillTracker() {
  const [skills] = useState<Skill[]>(DEFAULT_SKILLS);

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Bodyweight Skills</h3>
      <div className="space-y-3">
        {skills.map((skill) => (
          <div key={skill.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{skill.name}</span>
              <span className="text-xs font-mono" style={{ color: "#14B8A6" }}>{skill.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${skill.progress}%`, background: "#14B8A6" }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{skill.current}</span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{skill.target}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Joint Health Checklist ---

function JointHealthChecklist() {
  const [checks, setChecks] = useState<Record<string, boolean>>({
    "Bird-dogs": false,
    "Glute bridges": false,
    "Planks": false,
    "Hip circles": false,
    "Shoulder dislocates": false,
  });

  const toggle = (name: string) => setChecks((prev) => ({ ...prev, [name]: !prev[name] }));
  const completed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Joint Health</h3>
        <span className="text-xs font-mono" style={{ color: completed === total ? "#14B8A6" : "var(--text-tertiary)" }}>
          {completed}/{total}
        </span>
      </div>
      <div className="space-y-2">
        {Object.entries(checks).map(([name, done]) => (
          <button
            key={name}
            onClick={() => toggle(name)}
            className="flex items-center gap-2 w-full text-left rounded-lg px-3 py-2 transition-colors"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <div
              className="shrink-0 h-4 w-4 rounded flex items-center justify-center"
              style={{ border: done ? "none" : "1.5px solid var(--text-tertiary)", background: done ? "#14B8A6" : "transparent" }}
            >
              {done && <Check size={10} className="text-white" />}
            </div>
            <span className="text-sm" style={{ color: "var(--text-primary)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
              {name}
            </span>
          </button>
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

  const healthNotes = notes
    .filter((n) => n.area === "health")
    .map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt }));

  return (
    <AreaModule
      icon={<Heart size={24} />}
      title="Health & Training"
      color="#14B8A6"
      areaId="health"
      metrics={[
        { label: "Training this week", value: "0 / 5", color: "#14B8A6" },
        { label: "Sleep quality (7d avg)", value: "--", color: "#14B8A6" },
        { label: "Bodyweight skills", value: "3 tracked", color: "#14B8A6" },
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
        <SkillTracker />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <JointHealthChecklist />
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
