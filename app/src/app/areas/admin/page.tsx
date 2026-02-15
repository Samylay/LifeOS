"use client";

import { useState } from "react";
import { ClipboardList, Inbox, FileCheck, Plus, X, Clock, AlertTriangle, Check } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useNotes } from "@/lib/use-notes";

// --- Recurring Tasks ---

interface RecurringItem {
  id: string;
  name: string;
  frequency: string;
  nextDue: string;
}

function RecurringTasks() {
  const [items, setItems] = useState<RecurringItem[]>([
    { id: "1", name: "Pay rent", frequency: "Monthly", nextDue: "2026-03-01" },
    { id: "2", name: "Check bank statements", frequency: "Monthly", nextDue: "2026-02-28" },
    { id: "3", name: "Backup important files", frequency: "Weekly", nextDue: "2026-02-22" },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFreq, setNewFreq] = useState("Monthly");
  const [newDate, setNewDate] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newDate) return;
    setItems((prev) => [...prev, { id: Date.now().toString(), name: newName.trim(), frequency: newFreq, nextDue: newDate }]);
    setNewName("");
    setNewDate("");
    setShowAdd(false);
  };

  const today = new Date().toISOString().split("T")[0];
  const overdueCount = items.filter((i) => i.nextDue < today).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Recurring Tasks
          {overdueCount > 0 && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#EF444420", color: "#EF4444" }}>
              {overdueCount} overdue
            </span>
          )}
        </h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
          <Plus size={14} />
        </button>
      </div>
      {showAdd && (
        <div className="space-y-2 mb-3 p-3 rounded-lg" style={{ border: "1px solid var(--accent)" }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Task name..."
            className="w-full text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus />
          <div className="flex gap-2">
            <select value={newFreq} onChange={(e) => setNewFreq(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
              <option>Quarterly</option>
              <option>Yearly</option>
            </select>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
              style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((item) => {
          const isOverdue = item.nextDue < today;
          return (
            <div key={item.id} className="group flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              {isOverdue ? <AlertTriangle size={14} style={{ color: "#EF4444" }} /> : <Clock size={14} style={{ color: "var(--text-tertiary)" }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: isOverdue ? "#EF4444" : "var(--text-primary)" }}>{item.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.frequency}</span>
                  <span className="text-xs" style={{ color: isOverdue ? "#EF4444" : "var(--text-tertiary)" }}>Due: {item.nextDue}</span>
                </div>
              </div>
              <button onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Admin Inbox ---

function AdminInbox() {
  const { notes, createNote, deleteNote } = useNotes();
  const adminNotes = notes.filter((n) => n.area === "admin" && !n.processed);
  const [newItem, setNewItem] = useState("");

  const handleAdd = () => {
    if (!newItem.trim()) return;
    createNote({ content: newItem.trim(), area: "admin", tags: ["inbox"], processed: false });
    setNewItem("");
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Admin Inbox</h3>
      <div className="flex gap-2 mb-3">
        <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add admin item..."
          className="flex-1 text-xs bg-transparent rounded-lg px-3 py-2 outline-none"
          style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <button onClick={handleAdd} className="px-3 py-2 rounded-lg text-xs bg-emerald-500 text-white">Add</button>
      </div>
      {adminNotes.length === 0 ? (
        <div className="text-center py-4">
          <Inbox size={20} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-1" />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Inbox empty.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {adminNotes.map((note) => (
            <div key={note.id} className="group flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>{note.content}</span>
              <button onClick={() => deleteNote(note.id)}
                className="shrink-0 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "#10B98120", color: "#10B981" }}>
                Done
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Document Tracker ---

interface TrackedDocument {
  id: string;
  name: string;
  location: string;
  expiryDate?: string;
}

function DocumentTracker() {
  const [docs, setDocs] = useState<TrackedDocument[]>([
    { id: "1", name: "ID Card", location: "Wallet", expiryDate: "2028-06-15" },
    { id: "2", name: "Passport", location: "Home safe", expiryDate: "2030-09-20" },
    { id: "3", name: "Health Insurance Card", location: "Wallet" },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    setDocs((prev) => [...prev, { id: Date.now().toString(), name: newName.trim(), location: newLocation.trim() || "Not specified", expiryDate: newExpiry || undefined }]);
    setNewName("");
    setNewLocation("");
    setNewExpiry("");
    setShowAdd(false);
  };

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Document Tracker</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
          <Plus size={14} />
        </button>
      </div>
      {showAdd && (
        <div className="space-y-2 mb-3 p-3 rounded-lg" style={{ border: "1px solid var(--accent)" }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Document name..."
            className="w-full text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus />
          <div className="flex gap-2">
            <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Storage location"
              className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
              style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)}
              className="text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
              style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {docs.map((doc) => {
          const isExpiring = doc.expiryDate && doc.expiryDate <= thirtyDaysFromNow && doc.expiryDate > today;
          const isExpired = doc.expiryDate && doc.expiryDate <= today;
          return (
            <div key={doc.id} className="group flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
              <FileCheck size={14} style={{ color: isExpired ? "#EF4444" : isExpiring ? "#F59E0B" : "#64748B" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{doc.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{doc.location}</span>
                  {doc.expiryDate && (
                    <span className="text-xs" style={{ color: isExpired ? "#EF4444" : isExpiring ? "#F59E0B" : "var(--text-tertiary)" }}>
                      {isExpired ? "Expired" : isExpiring ? "Expiring soon" : `Exp: ${doc.expiryDate}`}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function AdminAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();

  const today = new Date().toISOString().split("T")[0];
  const adminTasks = tasks.filter((t) => t.area === "admin");
  const overdueTasks = adminTasks.filter((t) => t.dueDate && new Date(t.dueDate).toISOString().split("T")[0] < today && t.status !== "done");

  return (
    <AreaModule
      icon={<ClipboardList size={24} />}
      title="Life Admin"
      color="#64748B"
      areaId="admin"
      metrics={[
        { label: "Overdue items", value: overdueTasks.length, color: overdueTasks.length > 0 ? "#EF4444" : "#64748B" },
        { label: "Active admin tasks", value: adminTasks.filter((t) => t.status !== "done").length, color: "#64748B" },
        { label: "Documents tracked", value: 3, color: "#64748B" },
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
        <RecurringTasks />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <AdminInbox />
      </div>
      <div className="col-span-12 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <DocumentTracker />
      </div>
    </AreaModule>
  );
}
