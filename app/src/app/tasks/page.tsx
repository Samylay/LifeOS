"use client";

import { useState } from "react";
import { ListTodo, CheckCircle2, Zap, Flame, Plus, Search } from "lucide-react";
import { useTasks } from "@/lib/use-tasks";
import { TaskItem, TaskCreateForm } from "@/components/task-list";
import type { Task } from "@/lib/types";

type Tab = "todo" | "completed" | "energy";

export default function TasksPage() {
  const { tasks, loading, createTask, updateTask, deleteTask } = useTasks();
  const [activeTab, setActiveTab] = useState<Tab>("todo");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const todoTasks = filteredTasks.filter(t => t.status !== "done" && t.status !== "cancelled");
  const completedTasks = filteredTasks.filter(t => t.status === "done" || t.status === "cancelled");

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Tasks</h1>
          <p className="text-sm text-secondary">Manage your actionable items and deep work.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-2 bg-sage-500 hover:bg-sage-600 text-white rounded-xl px-5 py-2.5 font-medium transition-colors shadow-sm"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex p-1 rounded-xl bg-bg-secondary border border-primary">
          <TabButton 
            active={activeTab === "todo"} 
            onClick={() => setActiveTab("todo")} 
            icon={<ListTodo size={16} />} 
            label="To Do" 
            count={todoTasks.length}
          />
          <TabButton 
            active={activeTab === "energy"} 
            onClick={() => setActiveTab("energy")} 
            icon={<Zap size={16} />} 
            label="By Energy" 
          />
          <TabButton 
            active={activeTab === "completed"} 
            onClick={() => setActiveTab("completed")} 
            icon={<CheckCircle2 size={16} />} 
            label="Completed" 
          />
        </div>
        
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={16} />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-secondary border border-primary rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2">
          <TaskCreateForm 
            onSubmit={(data) => {
              createTask(data);
              setShowCreate(false);
            }} 
            onCancel={() => setShowCreate(false)} 
          />
        </div>
      )}

      <div className="space-y-6">
        {activeTab === "todo" && (
          <div className="space-y-3">
            {todoTasks.length === 0 ? (
              <EmptyState message="No tasks to do. Enjoy your free time!" />
            ) : (
              todoTasks.map(task => (
                <TaskItem key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
              ))
            )}
          </div>
        )}

        {activeTab === "completed" && (
          <div className="space-y-3">
            {completedTasks.length === 0 ? (
              <EmptyState message="No completed tasks yet." />
            ) : (
              completedTasks.map(task => (
                <TaskItem key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
              ))
            )}
          </div>
        )}

        {activeTab === "energy" && (
          <div className="space-y-8">
            <EnergySection 
              level={3} 
              label="High Energy / Deep Work" 
              tasks={todoTasks.filter(t => t.energy === 3)} 
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
            <EnergySection 
              level={2} 
              label="Medium Energy" 
              tasks={todoTasks.filter(t => t.energy === 2 || !t.energy)} 
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
            <EnergySection 
              level={1} 
              label="Low Energy / Admin" 
              tasks={todoTasks.filter(t => t.energy === 1)} 
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? "bg-bg-primary text-accent shadow-sm" 
          : "text-tertiary hover:text-secondary"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-accent-bg text-accent" : "bg-bg-tertiary text-tertiary"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function EnergySection({ level, label, tasks, onUpdate, onDelete }: { level: number; label: string; tasks: Task[]; onUpdate: any; onDelete: any }) {
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-0.5">
          <Flame size={14} className={level >= 1 ? "text-amber-500" : "text-tertiary"} fill={level >= 1 ? "currentColor" : "none"} />
          <Flame size={14} className={level >= 2 ? "text-amber-500" : "text-tertiary"} fill={level >= 2 ? "currentColor" : "none"} />
          <Flame size={14} className={level >= 3 ? "text-amber-500" : "text-tertiary"} fill={level >= 3 ? "currentColor" : "none"} />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-secondary">{label}</h3>
        <span className="text-[10px] font-mono text-tertiary ml-auto">{tasks.length} items</span>
      </div>
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskItem key={task.id} task={task} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center bg-bg-secondary rounded-2xl border border-dashed border-primary">
      <p className="text-sm text-tertiary italic">{message}</p>
    </div>
  );
}
