"use client";

import { useState } from "react";
import { DollarSign, Plus, X, Pencil } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useSubscriptions } from "@/lib/use-subscriptions";
import { useAreaData } from "@/lib/use-area-data";

// --- Types ---

interface BudgetCategory { name: string; budget: number; spent: number }
interface SavingsGoal { id: string; name: string; target: number; current: number }

interface FinanceAreaData {
  budgetCategories: BudgetCategory[];
  savingsGoals: SavingsGoal[];
}

const DEFAULT_FINANCE_DATA: FinanceAreaData = {
  budgetCategories: [
    { name: "Housing", budget: 800, spent: 800 },
    { name: "Food & Groceries", budget: 300, spent: 245 },
    { name: "Transport", budget: 100, spent: 78 },
    { name: "Subscriptions", budget: 50, spent: 42 },
    { name: "Health & Fitness", budget: 80, spent: 40 },
    { name: "Entertainment", budget: 100, spent: 65 },
    { name: "Other", budget: 150, spent: 90 },
  ],
  savingsGoals: [
    { id: "1", name: "Emergency Fund", target: 3000, current: 1200 },
    { id: "2", name: "Travel Fund", target: 1500, current: 450 },
  ],
};

// --- Monthly Snapshot (Editable + Persisted) ---

function MonthlySnapshot({ categories, onUpdate }: { categories: BudgetCategory[]; onUpdate: (cats: BudgetCategory[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);

  const totalBudget = categories.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const remaining = totalBudget - totalSpent;

  const updateSpent = (idx: number, spent: number) => {
    const updated = [...categories];
    updated[idx] = { ...updated[idx], spent };
    onUpdate(updated);
    setEditing(null);
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-secondary)" }}>Budget vs. Actual</h3>
      <div className="space-y-3 mb-4">
        {categories.map((cat, idx) => {
          const pct = Math.min(100, (cat.spent / cat.budget) * 100);
          const over = cat.spent > cat.budget;
          return (
            <div key={cat.name} className="group">
              <div className="flex justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--text-primary)" }}>{cat.name}</span>
                {editing === idx ? (
                  <input type="number" defaultValue={cat.spent} autoFocus
                    className="text-xs font-mono w-16 bg-transparent outline-none text-right rounded px-1"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--accent)" }}
                    onBlur={(e) => updateSpent(idx, parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => e.key === "Enter" && updateSpent(idx, parseFloat((e.target as HTMLInputElement).value) || 0)} />
                ) : (
                  <button onClick={() => setEditing(idx)}
                    className="text-xs font-mono flex items-center gap-1" style={{ color: over ? "#EF4444" : "var(--text-tertiary)" }}>
                    {cat.spent}&euro; / {cat.budget}&euro; <Pencil size={8} className="opacity-0 group-hover:opacity-100" />
                  </button>
                )}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "#EF4444" : pct > 80 ? "#F59E0B" : "#10B981" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Remaining</span>
        <span className="text-sm font-mono font-semibold" style={{ color: remaining >= 0 ? "#10B981" : "#EF4444" }}>
          {remaining >= 0 ? "+" : ""}{remaining}&euro;
        </span>
      </div>
    </div>
  );
}

// --- Subscription Tracker ---

function SubscriptionTracker() {
  const { subscriptions, createSubscription, deleteSubscription, totalMonthlyCost } = useSubscriptions();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newFreq, setNewFreq] = useState<"monthly" | "yearly">("monthly");

  const handleAdd = () => {
    if (!newName.trim() || !newCost) return;
    createSubscription({ name: newName.trim(), cost: parseFloat(newCost), frequency: newFreq, renewalDate: new Date() });
    setNewName("");
    setNewCost("");
    setShowAdd(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Subscriptions</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><Plus size={14} /></button>
      </div>
      {showAdd && (
        <div className="space-y-2 mb-3 p-3 rounded-lg" style={{ border: "1px solid var(--accent)" }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Subscription name..."
            className="w-full text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus />
          <div className="flex gap-2">
            <input type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Cost"
              className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
              style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
            <select value={newFreq} onChange={(e) => setNewFreq(e.target.value as "monthly" | "yearly")}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
            <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {subscriptions.map((sub) => (
          <div key={sub.id} className="group flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
            <div className="flex-1 min-w-0">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{sub.name}</span>
              <span className="text-xs ml-2" style={{ color: "var(--text-tertiary)" }}>({sub.frequency})</span>
            </div>
            <span className="text-sm font-mono font-semibold mr-2" style={{ color: "#F59E0B" }}>{sub.cost}&euro;</span>
            <button onClick={() => deleteSubscription(sub.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ color: "var(--text-tertiary)" }}>
              <X size={12} />
            </button>
          </div>
        ))}
        {subscriptions.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: "var(--text-tertiary)" }}>No subscriptions tracked yet.</p>
        )}
      </div>
      {subscriptions.length > 0 && (
        <div className="flex justify-between items-center mt-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Monthly total</span>
          <span className="text-sm font-mono font-semibold" style={{ color: "#F59E0B" }}>{totalMonthlyCost.toFixed(2)}&euro;</span>
        </div>
      )}
    </div>
  );
}

// --- Savings Goals (Editable + Persisted) ---

function SavingsGoals({ goals, onUpdate }: { goals: SavingsGoal[]; onUpdate: (goals: SavingsGoal[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const addGoal = () => {
    if (!newName.trim() || !newTarget) return;
    onUpdate([...goals, { id: Date.now().toString(), name: newName.trim(), target: parseFloat(newTarget), current: 0 }]);
    setNewName("");
    setNewTarget("");
    setShowAdd(false);
  };

  const updateCurrent = (id: string, current: number) => {
    onUpdate(goals.map((g) => (g.id === id ? { ...g, current } : g)));
    setEditingId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Savings Goals</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><Plus size={14} /></button>
      </div>
      {showAdd && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Goal name..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} autoFocus />
          <input type="number" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="Target"
            className="w-20 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }} />
          <button onClick={addGoal} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">Add</button>
        </div>
      )}
      <div className="space-y-4">
        {goals.map((goal) => {
          const pct = Math.min(100, (goal.current / goal.target) * 100);
          return (
            <div key={goal.id} className="group">
              <div className="flex justify-between mb-1">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{goal.name}</span>
                {editingId === goal.id ? (
                  <input type="number" defaultValue={goal.current} autoFocus
                    className="text-xs font-mono w-20 bg-transparent outline-none text-right rounded px-1"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--accent)" }}
                    onBlur={(e) => updateCurrent(goal.id, parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => e.key === "Enter" && updateCurrent(goal.id, parseFloat((e.target as HTMLInputElement).value) || 0)} />
                ) : (
                  <button onClick={() => setEditingId(goal.id)} className="text-xs font-mono flex items-center gap-1" style={{ color: "#F59E0B" }}>
                    {goal.current}&euro; / {goal.target}&euro; <Pencil size={8} className="opacity-0 group-hover:opacity-100" />
                  </button>
                )}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#F59E0B" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pct.toFixed(0)}% complete</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{goal.target - goal.current}&euro; to go</span>
                  <button onClick={() => onUpdate(goals.filter((g) => g.id !== goal.id))}
                    className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-tertiary)" }}>
                    <X size={10} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function FinanceAreaPage() {
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { habits, toggleToday, createHabit, deleteHabit } = useHabits();
  const { totalMonthlyCost } = useSubscriptions();
  const { data, updateData } = useAreaData("finance", DEFAULT_FINANCE_DATA);

  const totalBudget = data.budgetCategories.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = data.budgetCategories.reduce((sum, c) => sum + c.spent, 0);
  const savingsRate = totalBudget > 0 ? Math.round(((totalBudget - totalSpent) / totalBudget) * 100) : 0;

  return (
    <AreaModule
      icon={<DollarSign size={24} />}
      title="Finance"
      color="#F59E0B"
      areaId="finance"
      metrics={[
        { label: "Monthly budget", value: totalBudget.toLocaleString(), color: "#F59E0B", suffix: "\u20ac" },
        { label: "Subscriptions", value: `${totalMonthlyCost.toFixed(0)}`, color: "#F59E0B", suffix: "\u20ac/mo" },
        { label: "Savings rate", value: `${savingsRate}`, color: savingsRate > 0 ? "#10B981" : "#EF4444", suffix: "%" },
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
        <MonthlySnapshot categories={data.budgetCategories} onUpdate={(budgetCategories) => updateData({ budgetCategories })} />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SubscriptionTracker />
      </div>
      <div className="col-span-12 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SavingsGoals goals={data.savingsGoals} onUpdate={(savingsGoals) => updateData({ savingsGoals })} />
      </div>
    </AreaModule>
  );
}
