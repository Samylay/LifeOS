"use client";

import { Briefcase, FolderOpen, ChevronRight } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useProjects } from "@/lib/use-projects";
import { useAreaData } from "@/lib/use-area-data";

// --- Types ---
//
// Learning backlog and portfolio tracking live in the dedicated "Things to
// Learn" page (/things-to-learn) and the Projects tracker — not duplicated
// here. This area page focuses on skills and JECT project status only.

interface SkillEntry { name: string; level: number }
interface SkillCategory { name: string; skills: SkillEntry[] }

interface CareerAreaData {
  skillCategories: SkillCategory[];
}

const DEFAULT_CAREER_DATA: CareerAreaData = {
  skillCategories: [],
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

// --- Main Page ---

export default function CareerAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();
  const { notes, createNote, deleteNote } = useNotes();
  const { projects } = useProjects();
  const { data, updateData } = useAreaData("career", DEFAULT_CAREER_DATA);

  const careerNotes = notes.filter((n) => n.area === "career").map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt }));

  const totalSkills = data.skillCategories.reduce((sum, cat) => sum + cat.skills.length, 0);
  const jectProjectCount = projects.filter((p) => p.area === "career").length;

  return (
    <AreaModule
      icon={<Briefcase size={24} />}
      title="Career & Learning"
      color="#6366F1"
      areaId="career"
      metrics={[
        { label: "Skills tracked", value: totalSkills, color: "#6366F1" },
        { label: "JECT projects", value: jectProjectCount, color: "#6366F1" },
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
    </AreaModule>
  );
}
