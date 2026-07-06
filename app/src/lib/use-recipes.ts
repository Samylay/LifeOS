"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Recipe } from "./types";

export function useRecipes() {
  const { items: recipes, loading, create, update, remove } = useCollection<Recipe>(
    "recipes",
    { orderByField: "createdAt", orderDir: "desc", fallbackDates: ["createdAt"] }
  );

  const createRecipe = useCallback(
    async (data: Omit<Recipe, "id" | "createdAt">) => {
      await create({ ...data, createdAt: new Date() });
    },
    [create]
  );

  const updateRecipe = useCallback(
    async (id: string, data: Partial<Recipe>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteRecipe = useCallback(async (id: string) => remove(id), [remove]);

  return { recipes, loading, createRecipe, updateRecipe, deleteRecipe };
}
