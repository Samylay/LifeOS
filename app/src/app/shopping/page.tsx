"use client";

import { useState, useRef, useEffect } from "react";
import { ShoppingCart, Plus, Trash2, Check, X, ShoppingBag } from "lucide-react";
import { useShoppingList } from "@/lib/use-shopping-list";
import { useToast } from "@/components/toast";
import type { ShoppingCategory } from "@/lib/types";
import { SHOPPING_CATEGORIES } from "@/lib/types";

const CATEGORY_ORDER: ShoppingCategory[] = [
  "groceries",
  "beverages",
  "snacks",
  "frozen",
  "household",
  "personal_care",
  "other",
];

// --- Quick Add Bar ---

function QuickAdd({ onAdd }: { onAdd: (name: string, category: ShoppingCategory, quantity?: string) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ShoppingCategory>("groceries");
  const [quantity, setQuantity] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), category, quantity.trim() || undefined);
    setName("");
    setQuantity("");
    inputRef.current?.focus();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-4 flex flex-wrap items-center gap-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item..."
        className="flex-1 min-w-[160px] bg-transparent text-sm outline-none"
        style={{ color: "var(--text-primary)" }}
      />
      <input
        type="text"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Qty"
        className="w-20 bg-transparent text-sm outline-none text-center rounded-lg px-2 py-1.5"
        style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as ShoppingCategory)}
        className="text-xs rounded-lg px-2 py-1.5 outline-none"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
      >
        {CATEGORY_ORDER.map((cat) => (
          <option key={cat} value={cat}>
            {SHOPPING_CATEGORIES[cat].label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
      >
        <Plus size={16} /> Add
      </button>
    </form>
  );
}

// --- Shopping Item Row ---

function ShoppingItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: { id: string; name: string; quantity?: string; checked: boolean; category: ShoppingCategory };
  onToggle: () => void;
  onDelete: () => void;
}) {
  const cat = SHOPPING_CATEGORIES[item.category];

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 group transition-all"
      style={{
        background: item.checked ? "transparent" : "var(--bg-secondary)",
        border: item.checked ? "1px solid var(--border-primary)" : "1px solid var(--border-primary)",
        opacity: item.checked ? 0.5 : 1,
      }}
    >
      <button
        onClick={onToggle}
        className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-colors"
        style={{
          border: item.checked ? "none" : `2px solid ${cat.color}`,
          background: item.checked ? cat.color : "transparent",
        }}
      >
        {item.checked && <Check size={12} className="text-white" />}
      </button>

      <span
        className="flex-1 text-sm"
        style={{
          color: item.checked ? "var(--text-tertiary)" : "var(--text-primary)",
          textDecoration: item.checked ? "line-through" : "none",
        }}
      >
        {item.name}
      </span>

      {item.quantity && (
        <span
          className="text-xs px-2 py-0.5 rounded-md font-mono"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          {item.quantity}
        </span>
      )}

      <button
        onClick={onDelete}
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--text-tertiary)" }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// --- Main Page ---

export default function ShoppingPage() {
  const { items, loading, addItem, updateItem, deleteItem, clearChecked } = useShoppingList();
  const { toast } = useToast();
  const [groupByCategory, setGroupByCategory] = useState(true);

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const totalItems = items.length;
  const checkedCount = checked.length;

  const handleAdd = (name: string, category: ShoppingCategory, quantity?: string) => {
    addItem({ name, category, quantity, checked: false });
    toast("Item added");
  };

  const handleClearChecked = () => {
    if (checked.length === 0) return;
    clearChecked();
    toast(`Cleared ${checked.length} item${checked.length > 1 ? "s" : ""}`);
  };

  // Group unchecked items by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: unchecked.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Shopping List
          </h1>
          {totalItems > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              {checkedCount}/{totalItems} items checked
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-primary)" }}>
            <button
              onClick={() => setGroupByCategory(true)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: groupByCategory ? "var(--accent)" : "transparent",
                color: groupByCategory ? "white" : "var(--text-secondary)",
              }}
            >
              Grouped
            </button>
            <button
              onClick={() => setGroupByCategory(false)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: !groupByCategory ? "var(--accent)" : "transparent",
                color: !groupByCategory ? "white" : "var(--text-secondary)",
              }}
            >
              All
            </button>
          </div>
          {checked.length > 0 && (
            <button
              onClick={handleClearChecked}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ color: "var(--color-danger)", border: "1px solid var(--border-primary)" }}
            >
              <Trash2 size={14} /> Clear done
            </button>
          )}
        </div>
      </div>

      {/* Quick add */}
      <div className="mb-6">
        <QuickAdd onAdd={handleAdd} />
      </div>

      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="mb-6">
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((checkedCount / totalItems) * 100)}%`,
                background: "var(--accent)",
                transitionDuration: "var(--duration-normal)",
              }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalItems === 0 && !loading && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <ShoppingCart size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            List is empty
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Add items above to start your shopping list.
          </p>
        </div>
      )}

      {/* Items — grouped view */}
      {groupByCategory && unchecked.length > 0 && (
        <div className="space-y-5">
          {grouped.map((group) => {
            const cat = SHOPPING_CATEGORIES[group.category];
            return (
              <div key={group.category}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                  <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: cat.color }}>
                    {cat.label}
                  </h2>
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {group.items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      onToggle={() => updateItem(item.id, { checked: !item.checked })}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Items — flat view */}
      {!groupByCategory && unchecked.length > 0 && (
        <div className="space-y-1.5">
          {unchecked.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => updateItem(item.id, { checked: !item.checked })}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Checked items section */}
      {checked.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag size={14} style={{ color: "var(--text-tertiary)" }} />
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              In cart ({checked.length})
            </h2>
          </div>
          <div className="space-y-1.5">
            {checked.map((item) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                onToggle={() => updateItem(item.id, { checked: !item.checked })}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
