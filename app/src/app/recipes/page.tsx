"use client";

import { useMemo, useState } from "react";
import {
  CookingPot,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Beef,
  Snowflake,
  Link as LinkIcon,
} from "lucide-react";
import { useRecipes } from "@/lib/use-recipes";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Recipe, RecipeIngredient } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type RecipeDraft = Omit<Recipe, "id" | "createdAt" | "updatedAt">;

const EMPTY_DRAFT: RecipeDraft = { name: "", ingredients: [] };

function linesToIngredients(text: string): RecipeIngredient[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function ingredientsToLines(ingredients: RecipeIngredient[]): string {
  return ingredients
    .map((i) => (i.quantity ? `${i.quantity} ${i.name}` : i.name))
    .join("\n");
}

function linesToSteps(text: string): string[] | undefined {
  const steps = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return steps.length ? steps : undefined;
}

function parseTags(text: string): string[] | undefined {
  const tags = text
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function RecipeEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Recipe;
  onSave: (d: RecipeDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [ingredients, setIngredients] = useState(
    initial ? ingredientsToLines(initial.ingredients) : ""
  );
  const [steps, setSteps] = useState(initial?.steps?.join("\n") ?? "");
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");
  const [servings, setServings] = useState(initial?.servings ? String(initial.servings) : "");
  const [prepMinutes, setPrepMinutes] = useState(
    initial?.prepMinutes ? String(initial.prepMinutes) : ""
  );
  const [keepsDays, setKeepsDays] = useState(initial?.keepsDays ? String(initial.keepsDays) : "");
  const [kcal, setKcal] = useState(initial?.kcalPerServing ? String(initial.kcalPerServing) : "");
  const [protein, setProtein] = useState(
    initial?.proteinPerServingG ? String(initial.proteinPerServingG) : ""
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const valid = name.trim() !== "" && linesToIngredients(ingredients).length > 0;

  const save = () =>
    onSave({
      name: name.trim(),
      ingredients: linesToIngredients(ingredients),
      steps: linesToSteps(steps),
      tags: parseTags(tags),
      servings: numOrUndef(servings),
      prepMinutes: numOrUndef(prepMinutes),
      keepsDays: numOrUndef(keepsDays),
      kcalPerServing: numOrUndef(kcal),
      proteinPerServingG: numOrUndef(protein),
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });

  const numField = (
    label: string,
    value: string,
    set: (v: string) => void,
    width = "w-20"
  ) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground/70">
      <span className="font-semibold uppercase tracking-wider">{label}</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={`${width} h-auto text-sm rounded-lg px-2 py-1.5`}
      />
    </label>
  );

  return (
    <Card className="p-4 gap-3">
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Recipe name…"
        autoFocus
        className="w-full h-auto text-sm font-medium rounded-lg px-3 py-2"
      />
      <Textarea
        value={ingredients}
        onChange={(e) => setIngredients(e.target.value)}
        rows={6}
        placeholder={"Ingredients — one per line, quantity included\ne.g. 6 eggs, boiled 8 min"}
        className="w-full text-sm rounded-lg px-3 py-2 resize-none"
      />
      <Textarea
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
        rows={4}
        placeholder="Method — one step per line (optional)"
        className="w-full text-sm rounded-lg px-3 py-2 resize-none"
      />
      <div className="flex items-center gap-3 flex-wrap">
        {numField("Serves", servings, setServings, "w-16")}
        {numField("Prep min", prepMinutes, setPrepMinutes, "w-16")}
        {numField("Keeps (d)", keepsDays, setKeepsDays, "w-16")}
        {numField("kcal/serv", kcal, setKcal)}
        {numField("Protein g", protein, setProtein, "w-16")}
      </div>
      <div className="flex gap-3 flex-wrap">
        <Input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma-separated (meal-prep, high-protein…)"
          className="flex-1 min-w-48 h-auto text-sm rounded-lg px-3 py-2"
        />
        <Input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source URL (optional)"
          className="flex-1 min-w-48 h-auto text-sm rounded-lg px-3 py-2"
        />
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes — substitutions, where to buy, verdicts after cooking (optional)"
        className="w-full text-sm rounded-lg px-3 py-2 resize-none"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary" size="sm" className="gap-1.5 text-xs font-medium">
          <X size={14} /> Cancel
        </Button>
        <Button
          onClick={() => valid && save()}
          disabled={!valid}
          size="sm"
          className="gap-1.5 text-sm font-medium disabled:opacity-50"
        >
          <Check size={14} /> Save
        </Button>
      </div>
    </Card>
  );
}

function MetaBadges({ r }: { r: Recipe }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {r.servings != null && (
        <Badge variant="secondary" className="text-[10px] font-bold">
          serves {r.servings}
        </Badge>
      )}
      {r.prepMinutes != null && (
        <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
          <Clock size={10} /> {r.prepMinutes}m
        </Badge>
      )}
      {r.kcalPerServing != null && (
        <Badge variant="secondary" className="gap-1 text-[10px] font-medium tabular-nums">
          <Flame size={10} /> {r.kcalPerServing} kcal
        </Badge>
      )}
      {r.proteinPerServingG != null && (
        <Badge variant="secondary" className="gap-1 text-[10px] font-medium tabular-nums">
          <Beef size={10} /> {r.proteinPerServingG}g protein
        </Badge>
      )}
      {r.keepsDays != null && (
        <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
          <Snowflake size={10} /> keeps {r.keepsDays}d
        </Badge>
      )}
      {r.tags?.map((t) => (
        <Badge key={t} className="bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest">
          {t}
        </Badge>
      ))}
    </div>
  );
}

export default function RecipesPage() {
  const { recipes, loading, createRecipe, updateRecipe, deleteRecipe } = useRecipes();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | "all">("all");

  const allTags = useMemo(
    () => Array.from(new Set(recipes.flatMap((r) => r.tags ?? []))).sort(),
    [recipes]
  );
  const visible =
    tagFilter === "all" ? recipes : recipes.filter((r) => r.tags?.includes(tagFilter));

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
            <CookingPot size={22} className="text-primary" /> Recipes
          </h1>
          <p className="text-xs mt-1 text-muted-foreground/70">
            Meal-prep book. Per-serving kcal and protein feed the training side later.
          </p>
        </div>
        {!creating && (
          <Button
            onClick={() => setCreating(true)}
            size="sm"
            className="gap-1.5 text-sm font-medium"
          >
            <Plus size={15} /> New recipe
          </Button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTagFilter("all")}
            className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
              tagFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            All ({recipes.length})
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                tagFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {t} ({recipes.filter((r) => r.tags?.includes(t)).length})
            </button>
          ))}
        </div>
      )}

      {creating && (
        <RecipeEditor
          onSave={(d) => {
            createRecipe(d);
            setCreating(false);
            toast("Recipe added");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading && recipes.length === 0 && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {recipes.length === 0 && !loading && !creating && (
        <Card className="flex-col items-center justify-center py-16 text-center">
          <CookingPot size={48} className="mb-4 text-muted-foreground/70" />
          <p className="text-lg font-medium text-foreground">No recipes yet</p>
          <p className="text-sm mt-1 mb-4 max-w-sm text-muted-foreground">
            Add the first one — anything you actually cook or want to batch for the fridge.
          </p>
          <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5 text-sm font-medium">
            <Plus size={15} /> New recipe
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((r) =>
          editingId === r.id ? (
            <RecipeEditor
              key={r.id}
              initial={r}
              onSave={(d) => {
                updateRecipe(r.id, d);
                setEditingId(null);
                toast("Recipe updated");
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <Card key={r.id} className="px-4 py-3 gap-0">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => toggleOpen(r.id)}
                  className="min-w-0 flex-1 text-left active:scale-[0.99] transition-transform duration-150"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                    {openIds.has(r.id) ? (
                      <ChevronUp size={14} className="shrink-0 text-muted-foreground/70" />
                    ) : (
                      <ChevronDown size={14} className="shrink-0 text-muted-foreground/70" />
                    )}
                  </div>
                  <div className="mt-1.5">
                    <MetaBadges r={r} />
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {r.source && (
                    <a
                      href={r.source}
                      target="_blank"
                      rel="noreferrer"
                      title={r.source}
                      className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground"
                    >
                      <LinkIcon size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => setEditingId(r.id)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmId(r.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {openIds.has(r.id) && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/70">
                      Ingredients
                    </p>
                    <ul className="space-y-1">
                      {r.ingredients.map((i, idx) => (
                        <li key={idx} className="text-sm flex gap-2 text-muted-foreground">
                          <span className="text-primary">•</span>
                          <span>{i.quantity ? `${i.quantity} ${i.name}` : i.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    {r.steps && r.steps.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/70">
                          Method
                        </p>
                        <ol className="space-y-1">
                          {r.steps.map((s, idx) => (
                            <li key={idx} className="text-sm flex gap-2 text-muted-foreground">
                              <span className="font-semibold text-foreground tabular-nums">{idx + 1}.</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {r.notes && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/70">
                          Notes
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete recipe?"
        message="This removes the recipe from the book."
        onConfirm={() => {
          if (confirmId) deleteRecipe(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
