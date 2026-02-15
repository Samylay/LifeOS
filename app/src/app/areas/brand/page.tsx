"use client";

import { useState } from "react";
import { Megaphone, Calendar, FileText, Lightbulb, Plus, X } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";
import { useAreaData } from "@/lib/use-area-data";

// --- Types ---

interface ContentItem {
  id: string;
  title: string;
  platform: string;
  date: string;
  status: "draft" | "scheduled" | "published";
}

interface BrandAreaData {
  contentItems: ContentItem[];
}

const DEFAULT_BRAND_DATA: BrandAreaData = {
  contentItems: [],
};

const platformColors: Record<string, string> = {
  Instagram: "#E1306C",
  YouTube: "#FF0000",
  "Mailing List": "#10B981",
  LinkedIn: "#0A66C2",
  Twitter: "#1DA1F2",
};

// --- Content Calendar (Persisted) ---

function ContentCalendar({ items, onUpdate }: { items: ContentItem[]; onUpdate: (items: ContentItem[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState("Instagram");
  const [newDate, setNewDate] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim() || !newDate) return;
    onUpdate([...items, { id: Date.now().toString(), title: newTitle.trim(), platform: newPlatform, date: newDate, status: "draft" }]);
    setNewTitle("");
    setNewDate("");
    setShowAdd(false);
  };

  const cycleStatus = (id: string) => {
    const order: ContentItem["status"][] = ["draft", "scheduled", "published"];
    onUpdate(items.map((item) => {
      if (item.id !== id) return item;
      const nextIdx = (order.indexOf(item.status) + 1) % order.length;
      return { ...item, status: order[nextIdx] };
    }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Content Calendar</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><Plus size={14} /></button>
      </div>
      {showAdd && (
        <div className="space-y-2 mb-3 p-3 rounded-lg" style={{ border: "1px solid var(--accent)" }}>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Content title..."
            className="w-full text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus />
          <div className="flex gap-2">
            <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
              <option>Instagram</option><option>YouTube</option><option>Mailing List</option><option>LinkedIn</option><option>Twitter</option>
            </select>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
              style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
          </div>
        </div>
      )}
      {items.length === 0 && !showAdd ? (
        <div className="text-center py-6">
          <Calendar size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No content planned yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              <div className="shrink-0 h-2 w-2 rounded-full" style={{ background: platformColors[item.platform] || "#8B5CF6" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: platformColors[item.platform] || "#8B5CF6" }}>{item.platform}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.date}</span>
                </div>
              </div>
              <button onClick={() => cycleStatus(item.id)}
                className="text-xs px-2 py-0.5 rounded-full capitalize cursor-pointer hover:opacity-80"
                style={{ background: item.status === "published" ? "#10B98120" : item.status === "scheduled" ? "#F59E0B20" : "#64748B20",
                  color: item.status === "published" ? "#10B981" : item.status === "scheduled" ? "#F59E0B" : "#64748B" }}>
                {item.status}
              </button>
              <button onClick={() => onUpdate(items.filter((i) => i.id !== item.id))}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Publishing Log (computed from content items) ---

function PublishingLog({ items }: { items: ContentItem[] }) {
  const published = items.filter((i) => i.status === "published");

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Publishing Log</h3>
      {published.length === 0 ? (
        <div className="text-center py-6">
          <FileText size={24} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No published content yet. Mark items as published in the calendar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {published.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              <div className="shrink-0 h-2 w-2 rounded-full" style={{ background: platformColors[item.platform] || "#8B5CF6" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.platform} - {item.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Ideas Backlog ---

function IdeasBacklog() {
  const { notes, createNote, deleteNote } = useNotes();
  const brandNotes = notes.filter((n) => n.area === "brand");
  const [newIdea, setNewIdea] = useState("");

  const handleAdd = () => {
    if (!newIdea.trim()) return;
    createNote({ content: newIdea.trim(), area: "brand", tags: ["idea"], processed: false });
    setNewIdea("");
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Ideas Backlog</h3>
      <div className="flex gap-2 mb-3">
        <input type="text" value={newIdea} onChange={(e) => setNewIdea(e.target.value)} placeholder="Content idea..."
          className="flex-1 text-xs bg-transparent rounded-lg px-3 py-2 outline-none"
          style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <button onClick={handleAdd} className="px-3 py-2 rounded-lg text-xs bg-emerald-500 text-white">Add</button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {brandNotes.length === 0 && (
          <p className="text-xs text-center py-2" style={{ color: "var(--text-tertiary)" }}>Capture content ideas with the capture bar or add them here.</p>
        )}
        {brandNotes.map((note) => (
          <div key={note.id} className="group flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
            <Lightbulb size={12} style={{ color: "#8B5CF6" }} />
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>{note.content}</span>
            <button onClick={() => deleteNote(note.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function BrandAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();
  const { notes } = useNotes();
  const { data, updateData } = useAreaData("brand", DEFAULT_BRAND_DATA);

  const brandNotes = notes.filter((n) => n.area === "brand");
  const publishedThisWeek = data.contentItems.filter((i) => {
    if (i.status !== "published") return false;
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    return i.date >= weekStart.toISOString().split("T")[0];
  }).length;

  return (
    <AreaModule
      icon={<Megaphone size={24} />}
      title="Personal Brand"
      color="#8B5CF6"
      areaId="brand"
      metrics={[
        { label: "Posts this week", value: publishedThisWeek, color: "#8B5CF6" },
        { label: "Content planned", value: data.contentItems.filter((i) => i.status !== "published").length, color: "#8B5CF6" },
        { label: "Ideas in backlog", value: brandNotes.length, color: "#8B5CF6" },
      ]}
      tasks={tasks}
      onTaskUpdate={updateTask}
      onTaskDelete={deleteTask}
      onTaskCreate={createTask}
      habits={habits}
      onHabitToggle={toggleToday}
      onHabitCreate={createHabit}
      onHabitDelete={deleteHabit}
    >
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <ContentCalendar items={data.contentItems} onUpdate={(contentItems) => updateData({ contentItems })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <PublishingLog items={data.contentItems} />
      </div>
      <div className="col-span-12 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <IdeasBacklog />
      </div>
    </AreaModule>
  );
}
