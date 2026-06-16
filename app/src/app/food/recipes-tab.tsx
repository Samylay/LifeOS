"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ShoppingCart,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
  Clock,
  Users,
} from "lucide-react";
import { useRecipes } from "@/lib/use-recipes";
import { useShoppingList } from "@/lib/use-shopping-list";
import { useToast } from "@/components/toast";
import type { Recipe, RecipeIngredient, ShoppingCategory } from "@/lib/types";
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

// --- Recipe editor (create/edit) ---

interface DraftIngredient {
  name: string;
  quantity: string;
  category: ShoppingCategory;
}

function emptyIngredient(): DraftIngredient {
  return { name: "", quantity: "", category: "groceries" };
}

function RecipeEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Recipe;
  onSave: (data: Omit<Recipe, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [servings, setServings] = useState(initial?.servings?.toString() || "");
  const [prepMinutes, setPrepMinutes] = useState(initial?.prepMinutes?.toString() || "");
  const [tags, setTags] = useState((initial?.tags || []).join(", "));
  const [steps, setSteps] = useState((initial?.steps || []).join("\n"));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity || "",
          category: i.category || "groceries",
        }))
      : [emptyIngredient()]
  );

  const updateIngredient = (idx: number, patch: Partial<DraftIngredient>) => {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)));
  };

  const addIngredientRow = () => setIngredients((prev) => [...prev, emptyIngredient()]);
  const removeIngredientRow = (idx: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!name.trim()) return;
    const cleanedIngredients: RecipeIngredient[] = ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        quantity: i.quantity.trim() || undefined,
        category: i.category,
      }));

    onSave({
      name: name.trim(),
      ingredients: cleanedIngredients,
      steps: steps.trim() ? steps.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
      tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      servings: servings.trim() ? Number(servings) : undefined,
      prepMinutes: prepMinutes.trim() ? Number(prepMinutes) : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Recipe name..."
        autoFocus
        className="w-full bg-transparent text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={{ color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
      />

      <div className="flex gap-2">
        <input
          type="number"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="Servings"
          className="w-24 bg-transparent text-xs outline-none rounded-lg px-2 py-1.5 text-center"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
        />
        <input
          type="number"
          value={prepMinutes}
          onChange={(e) => setPrepMinutes(e.target.value)}
          placeholder="Prep min"
          className="w-24 bg-transparent text-xs outline-none rounded-lg px-2 py-1.5 text-center"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
        />
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma separated)"
          className="flex-1 bg-transparent text-xs outline-none rounded-lg px-2 py-1.5"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
        />
      </div>

      {/* Ingredients */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
          Ingredients
        </p>
        <div className="space-y-1.5">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                placeholder="Ingredient"
                className="flex-1 min-w-0 bg-transparent text-sm outline-none rounded-lg px-2 py-1.5"
                style={{ color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
              />
              <input
                type="text"
                value={ing.quantity}
                onChange={(e) => updateIngredient(idx, { quantity: e.target.value })}
                placeholder="Qty"
                className="w-16 bg-transparent text-xs outline-none rounded-lg px-2 py-1.5 text-center"
                style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
              />
              <select
                value={ing.category}
                onChange={(e) => updateIngredient(idx, { category: e.target.value as ShoppingCategory })}
                className="text-xs rounded-lg px-1.5 py-1.5 outline-none"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {SHOPPING_CATEGORIES[cat].label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeIngredientRow(idx)}
                className="shrink-0 p-1.5 rounded-lg"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addIngredientRow}
          className="mt-2 flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--accent)" }}
        >
          <Plus size={12} /> Add ingredient
        </button>
      </div>

      {/* Steps */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
          Steps (one per line)
        </p>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={3}
          placeholder="1. Preheat oven...&#10;2. Mix ingredients..."
          className="w-full bg-transparent text-sm outline-none rounded-lg px-3 py-2 resize-none"
          style={{ color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
        />
      </div>

      {/* Notes */}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full bg-transparent text-xs outline-none rounded-lg px-3 py-2"
        style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}
      />

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

// --- Recipe Card ---

function RecipeCard({
  recipe,
  onUpdate,
  onDelete,
  onAddToShopping,
}: {
  recipe: Recipe;
  onUpdate: (data: Omit<Recipe, "id" | "createdAt">) => void;
  onDelete: () => void;
  onAddToShopping: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <RecipeEditor
        initial={recipe}
        onSave={(data) => {
          onUpdate(data);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-start gap-3 text-left min-w-0"
        >
          <div
            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "var(--accent-bg)" }}
          >
            <ChefHat size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {recipe.name}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {recipe.servings && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  <Users size={11} /> {recipe.servings}
                </span>
              )}
              {recipe.prepMinutes && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  <Clock size={11} /> {recipe.prepMinutes}m
                </span>
              )}
              {recipe.tags?.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded-md"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAddToShopping}
            title="Add ingredients to shopping list"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--accent)" }}
          >
            <ShoppingCart size={15} />
          </button>
          <button
            onClick={() => setEditing(true)}
            title="Edit"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
          {recipe.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                Ingredients
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  >
                    {ing.name}
                    {ing.quantity ? ` (${ing.quantity})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recipe.steps && recipe.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                Steps
              </p>
              <ol className="space-y-1 list-decimal list-inside text-sm" style={{ color: "var(--text-primary)" }}>
                {recipe.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {recipe.notes && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {recipe.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Recipes Tab ---

export function RecipesTab() {
  const { recipes, loading, createRecipe, updateRecipe, deleteRecipe } = useRecipes();
  const { items, addItem } = useShoppingList();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const pushIngredientsToShoppingList = (ingredients: RecipeIngredient[]) => {
    let added = 0;
    for (const ing of ingredients) {
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
    return added;
  };

  const handleAddToShopping = (recipe: Recipe) => {
    const added = pushIngredientsToShoppingList(recipe.ingredients);
    toast(added > 0 ? `Added ${added} item${added > 1 ? "s" : ""} to shopping list` : "Already on the list");
  };

  return (
    <div className="space-y-4">
      {/* Quick add trigger */}
      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl p-4 text-sm font-medium transition-colors"
          style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <Plus size={16} /> New recipe
        </button>
      ) : (
        <RecipeEditor
          onSave={(data) => {
            createRecipe(data);
            setCreating(false);
            toast("Recipe saved");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Empty state */}
      {recipes.length === 0 && !loading && !creating && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <ChefHat size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No recipes yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Add your go-to meals to plan your week and shop faster.
          </p>
        </div>
      )}

      {/* Recipe list */}
      <div className="space-y-2">
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onUpdate={(data) => updateRecipe(recipe.id, data)}
            onDelete={() => deleteRecipe(recipe.id)}
            onAddToShopping={() => handleAddToShopping(recipe)}
          />
        ))}
      </div>
    </div>
  );
}
