"use client";

import { useState } from "react";
import { ChefHat, CalendarDays } from "lucide-react";
import { RecipesTab } from "./recipes-tab";
import { MealPlanTab } from "./mealplan-tab";

type Tab = "recipes" | "meals";

export default function FoodPage() {
  const [tab, setTab] = useState<Tab>("recipes");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Food
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Recipes &amp; weekly meal plan
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-primary)" }}>
          <button
            onClick={() => setTab("recipes")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: tab === "recipes" ? "var(--accent)" : "transparent",
              color: tab === "recipes" ? "white" : "var(--text-secondary)",
            }}
          >
            <ChefHat size={14} /> Recipes
          </button>
          <button
            onClick={() => setTab("meals")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: tab === "meals" ? "var(--accent)" : "transparent",
              color: tab === "meals" ? "white" : "var(--text-secondary)",
            }}
          >
            <CalendarDays size={14} /> Meal Plan
          </button>
        </div>
      </div>

      {tab === "recipes" ? <RecipesTab /> : <MealPlanTab />}
    </div>
  );
}
