"use client";

import { useState, useMemo } from "react";
import { ShoppingCart, X, ChefHat, CalendarDays } from "lucide-react";
import { useMealPlan, getWeekStart } from "@/lib/use-mealplan";
import { useRecipes } from "@/lib/use-recipes";
import { useShoppingList } from "@/lib/use-shopping-list";
import { useToast } from "@/components/toast";
import {
  MEAL_DAYS,
  MEAL_DAY_LABELS,
  MEAL_SLOTS,
  type MealDay,
  type MealSlot,
  type RecipeIngredient,
} from "@/lib/types";

const SLOT_LABELS: Record<MealSlot, string> = { lunch: "Lunch", dinner: "Dinner" };

function MealCell({
  day,
  slot,
  recipeId,
  recipeName,
  text,
  recipes,
  onSet,
}: {
  day: MealDay;
  slot: MealSlot;
  recipeId?: string;
  recipeName?: string;
  text?: string;
  recipes: { id: string; name: string }[];
  onSet: (entry: { recipeId?: string; recipeName?: string; text?: string } | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text || "");

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <select
          value={recipeId || ""}
          onChange={(e) => {
            const rid = e.target.value;
            if (!rid) return;
            const r = recipes.find((x) => x.id === rid);
            onSet({ recipeId: rid, recipeName: r?.name });
            setEditing(false);
          }}
          className="text-xs rounded-lg px-2 py-1.5 outline-none w-full"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
        >
          <option value="">— Choose recipe —</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Or type free text..."
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-xs outline-none rounded-lg px-2 py-1.5"
            style={{ color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onSet({ text: draft.trim() });
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            onClick={() => setEditing(false)}
            className="shrink-0 p-1.5 rounded-lg"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  const label = recipeName || text;

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left rounded-lg px-2.5 py-2 text-xs transition-colors group relative"
      style={{
        background: label ? "var(--accent-bg)" : "var(--bg-tertiary)",
        color: label ? "var(--accent)" : "var(--text-tertiary)",
        minHeight: 40,
        border: "1px solid var(--border-primary)",
      }}
    >
      {label || "+ Add"}
      {label && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onSet(null);
          }}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={11} />
        </span>
      )}
    </button>
  );
}

export function MealPlanTab() {
  const weekId = useMemo(() => getWeekStart(), []);
  const { plan, loading, setMeal } = useMealPlan(weekId);
  const { recipes } = useRecipes();
  const { items, addItem } = useShoppingList();
  const { toast } = useToast();

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const handleShopWeek = () => {
    if (!plan) return;
    const ingredientsMap = new Map<string, RecipeIngredient>();

    for (const day of MEAL_DAYS) {
      for (const slot of MEAL_SLOTS) {
        const entry = plan.meals[day]?.[slot];
        if (!entry?.recipeId) continue;
        const recipe = recipeById.get(entry.recipeId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) {
          const key = ing.name.trim().toLowerCase();
          if (!ingredientsMap.has(key)) {
            ingredientsMap.set(key, ing);
          }
        }
      }
    }

    let added = 0;
    for (const ing of ingredientsMap.values()) {
      const exists = items.some(
        (i) => i.name.trim().toLowerCase() === ing.name.trim().toLowerCase() && !i.checked
      );
      if (exists) continue;
      addItem({
        name: ing.name,
        category: ing.category || "groceries",
        quantity: ing.quantity,
        checked: false,
      });
      added++;
    }

    toast(added > 0 ? `Added ${added} ingredient${added > 1 ? "s" : ""} to shopping list` : "Nothing new to add");
  };

  if (loading || !plan) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Loading meal plan...
        </p>
      </div>
    );
  }

  const recipeOptions = recipes.map((r) => ({ id: r.id, name: r.name }));
  const hasAnyPlannedRecipe = MEAL_DAYS.some((d) =>
    MEAL_SLOTS.some((s) => plan.meals[d]?.[s]?.recipeId)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
          <CalendarDays size={13} /> Week of {weekId}
        </p>
        <button
          onClick={handleShopWeek}
          disabled={!hasAnyPlannedRecipe}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-40"
        >
          <ShoppingCart size={14} /> Shop this week
        </button>
      </div>

      {recipes.length === 0 && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          <ChefHat size={14} />
          Add some recipes first to plan meals from them, or just type free text.
        </div>
      )}

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
        {/* Mobile: stacked by day. Desktop: grid */}
        <div className="divide-y" style={{ borderColor: "var(--border-primary)" }}>
          {MEAL_DAYS.map((day) => (
            <div key={day} className="p-3 sm:flex sm:items-center sm:gap-3">
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2 sm:mb-0 sm:w-24 sm:shrink-0"
                style={{ color: "var(--text-secondary)" }}
              >
                {MEAL_DAY_LABELS[day]}
              </p>
              <div className="grid grid-cols-2 gap-2 flex-1">
                {MEAL_SLOTS.map((slot) => {
                  const entry = plan.meals[day]?.[slot];
                  return (
                    <div key={slot}>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
                        {SLOT_LABELS[slot]}
                      </p>
                      <MealCell
                        day={day}
                        slot={slot}
                        recipeId={entry?.recipeId}
                        recipeName={entry?.recipeName}
                        text={entry?.text}
                        recipes={recipeOptions}
                        onSet={(e) => setMeal(day, slot, e)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
