"use client";

import { useState } from "react";
import { DollarSign, Plus, X } from "lucide-react";
import { AreaModule } from "@/components/area-module";
import { useTasks } from "@/lib/use-tasks";
import { useHabits } from "@/lib/use-habits";
import { useSubscriptions } from "@/lib/use-subscriptions";

// --- Monthly Snapshot ---

function MonthlySnapshot() {
  const [categories] = useState([
    { name: "Housing", budget: 800, spent: 800 },
    { name: "Food & Groceries", budget: 300, spent: 245 },
    { name: "Transport", budget: 100, spent: 78 },
    { name: "Subscriptions", budget: 50, spent: 42 },
    { name: "Health & Fitness", budget: 80, spent: 40 },
    { name: "Entertainment", budget: 100, spent: 65 },
    { name: "Other", budget: 150, spent: 90 },
  ]);

  const totalBudget = categories.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const remaining = totalBudget - totalSpent;

  return (
    <div>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-secondary)" }}>Budget vs. Actual</h3>
      <div className="space-y-3 mb-4">
        {categories.map((cat) => {
          const pct = Math.min(100, (cat.spent / cat.budget) * 100);
          const over = cat.spent > cat.budget;
          return (
            <div key={cat.name}>
              <div className="flex justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--text-primary)" }}>{cat.name}</span>
                <span className="text-xs font-mono" style={{ color: over ? "#EF4444" : "var(--text-tertiary)" }}>
                  {cat.spent}&euro; / {cat.budget}&euro;
                </span>
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
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
          <Plus size={14} />
        </button>
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
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
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

// --- Savings Goals ---

function SavingsGoals() {
  const [goals] = useState([
    { name: "Emergency Fund", target: 3000, current: 1200 },
    { name: "Travel Fund", target: 1500, current: 450 },
  ]);

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Savings Goals</h3>
      <div className="space-y-4">
        {goals.map((goal) => {
          const pct = Math.min(100, (goal.current / goal.target) * 100);
          return (
            <div key={goal.name}>
              <div className="flex justify-between mb-1">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{goal.name}</span>
                <span className="text-xs font-mono" style={{ color: "#F59E0B" }}>{goal.current}&euro; / {goal.target}&euro;</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#F59E0B" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pct.toFixed(0)}% complete</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{goal.target - goal.current}&euro; to go</span>
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

  return (
    <AreaModule
      icon={<DollarSign size={24} />}
      title="Finance"
      color="#F59E0B"
      areaId="finance"
      metrics={[
        { label: "Monthly budget", value: "1,580", color: "#F59E0B", suffix: "\u20ac" },
        { label: "Subscriptions", value: `${totalMonthlyCost.toFixed(0)}`, color: "#F59E0B", suffix: "\u20ac/mo" },
        { label: "Savings rate", value: "--", color: "#F59E0B" },
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
        <MonthlySnapshot />
      </div>
      <div className="col-span-12 lg:col-span-6 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SubscriptionTracker />
      </div>
      <div className="col-span-12 rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        <SavingsGoals />
      </div>
    </AreaModule>
  );
}
