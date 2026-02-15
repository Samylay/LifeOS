"use client";

import { useState } from "react";
import { Briefcase, BookOpen, FolderOpen, Plus, X, ChevronRight } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useProjects } from "@/lib/use-projects";
import { useAreaData } from "@/lib/use-area-data";
import { useFocusTimer } from "@/lib/use-focus";

// --- Types ---

interface SkillEntry { name: string; level: number }
interface SkillCategory { name: string; skills: SkillEntry[] }
interface LearningItem { id: string; title: string; type: string }
interface PortfolioItem { id: string; name: string; status: string }

interface CareerAreaData {
  skillCategories: SkillCategory[];
  learningQueue: LearningItem[];
  portfolioItems: PortfolioItem[];
}

const DEFAULT_CAREER_DATA: CareerAreaData = {
  skillCategories: [
    { name: "Web Development", skills: [
      { name: "React / Next.js", level: 4 }, { name: "TypeScript", level: 3 },
      { name: "Tailwind CSS", level: 4 }, { name: "Node.js / APIs", level: 3 },
    ]},
    { name: "AI & LLM", skills: [
      { name: "Prompt Engineering", level: 3 }, { name: "LLM Integration", level: 2 },
      { name: "Machine Learning Basics", level: 1 },
    ]},
    { name: "Cybersecurity", skills: [
      { name: "Reverse Engineering", level: 2 }, { name: "CTF Challenges", level: 2 },
      { name: "Network Security", level: 1 },
    ]},
  ],
  learningQueue: [
    { id: "1", title: "42sh Shell Project", type: "Course" },
    { id: "2", title: "Advanced TypeScript Patterns", type: "Book" },
    { id: "3", title: "LLM Function Calling Deep Dive", type: "Tutorial" },
  ],
  portfolioItems: [
    { id: "1", name: "LifeOS App", status: "In Progress" },
    { id: "2", name: "RVTNails Website", status: "Completed" },
    { id: "3", name: "JECT Client Projects", status: "Ongoing" },
  ],
};

// --- Editable Skill Tree ---

function SkillTree({ categories, onUpdate }: { categories: SkillCategory[]; onUpdate: (cats: SkillCategory[]) => void }) {
  const levelLabels = ["", "Beginner", "Intermediate", "Advanced", "Proficient", "Expert"];

  const setLevel = (catIdx: number, skillIdx: number, level: number) => {
    const updated = categories.map((cat, ci) =>
      ci === catIdx ? { ...cat, skills: cat.skills.map((s, si) => (si === skillIdx ? { ...s, level } : s)) } : cat
    );
    onUpdate(updated);
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-secondary)" }}>Skill Tree</h3>
      <div className="space-y-5">
        {categories.map((cat, catIdx) => (
          <div key={cat.name}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6366F1" }}>{cat.name}</h4>
            <div className="space-y-2">
              {cat.skills.map((skill, skillIdx) => (
                <div key={skill.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{skill.name}</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{levelLabels[skill.level]}</span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button key={lvl} onClick={() => setLevel(catIdx, skillIdx, lvl)}
                        className="h-1.5 flex-1 rounded-full transition-colors cursor-pointer hover:opacity-80"
                        style={{ background: lvl <= skill.level ? "#6366F1" : "var(--bg-tertiary)" }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- JECT Project Tracker ---

function JECTTracker() {
  const { projects } = useProjects();
  const jectProjects = projects.filter((p) => p.area === "career");

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>JECT Projects</h3>
      {jectProjects.length === 0 ? (
        <div className="text-center py-6">
          <FolderOpen size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No JECT projects yet. Create projects in the Projects tracker.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jectProjects.map((project) => (
            <div key={project.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{project.title}</p>
                <span className="text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>{project.status}</span>
              </div>
              <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Learning Queue (Persisted) ---

function LearningQueue({ items, onUpdate }: { items: LearningItem[]; onUpdate: (items: LearningItem[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("Topic");

  const addItem = () => {
    if (!newTitle.trim()) return;
    onUpdate([...items, { id: Date.now().toString(), title: newTitle.trim(), type: newType }]);
    setNewTitle("");
    setShowAdd(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Learning Queue</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><Plus size={14} /></button>
      </div>
      {showAdd && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What to learn..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
            autoFocus onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            <option>Topic</option><option>Course</option><option>Book</option><option>Tutorial</option>
          </select>
          <button onClick={addItem} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
        </div>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
            <BookOpen size={14} style={{ color: "#6366F1" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.type}</span>
            </div>
            <button onClick={() => onUpdate(items.filter((i) => i.id !== item.id))}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Portfolio (Persisted) ---

function PortfolioItems({ items, onUpdate }: { items: PortfolioItem[]; onUpdate: (items: PortfolioItem[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState("In Progress");

  const addItem = () => {
    if (!newName.trim()) return;
    onUpdate([...items, { id: Date.now().toString(), name: newName.trim(), status: newStatus }]);
    setNewName("");
    setShowAdd(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Portfolio</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><Plus size={14} /></button>
      </div>
      {showAdd && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
            autoFocus onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            <option>In Progress</option><option>Completed</option><option>Ongoing</option>
          </select>
          <button onClick={addItem} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
        </div>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: item.status === "Completed" ? "#10B98120" : "#6366F120", color: item.status === "Completed" ? "#10B981" : "#6366F1" }}>
                {item.status}
              </span>
              <button onClick={() => onUpdate(items.filter((i) => i.id !== item.id))}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function CareerAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();
  const { notes, createNote, deleteNote } = useNotes();
  const { data, updateData } = useAreaData("career", DEFAULT_CAREER_DATA);
  const { todaySessions } = useFocusTimer();

  const careerNotes = notes.filter((n) => n.area === "career").map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt }));

  const totalSkills = data.skillCategories.reduce((sum, cat) => sum + cat.skills.length, 0);
  const learningMinutes = todaySessions
    .filter((s) => s.area === "career" && s.type === "focus" && s.status === "completed")
    .reduce((sum, s) => sum + (s.actualDuration || 0), 0);

  return (
    <AreaModule
      icon={<Briefcase size={24} />}
      title="Career & Learning"
      color="#6366F1"
      areaId="career"
      metrics={[
        { label: "Focus time today", value: (learningMinutes / 60).toFixed(1), color: "#6366F1", suffix: "h" },
        { label: "Skills tracked", value: totalSkills, color: "#6366F1" },
        { label: "Portfolio items", value: data.portfolioItems.length, color: "#6366F1" },
      ]}
      tasks={tasks}
      onTaskUpdate={updateTask}
      onTaskDelete={deleteTask}
      onTaskCreate={createTask}
      habits={habits}
      onHabitToggle={toggleToday}
      onHabitCreate={createHabit}
      onHabitDelete={deleteHabit}
      notes={careerNotes}
      onNoteAdd={(content) => createNote({ content, area: "career", tags: [], processed: false })}
      onNoteDelete={deleteNote}
    >
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SkillTree categories={data.skillCategories} onUpdate={(skillCategories) => updateData({ skillCategories })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <JECTTracker />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <LearningQueue items={data.learningQueue} onUpdate={(learningQueue) => updateData({ learningQueue })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <PortfolioItems items={data.portfolioItems} onUpdate={(portfolioItems) => updateData({ portfolioItems })} />
      </div>
    </AreaModule>
  );
}
