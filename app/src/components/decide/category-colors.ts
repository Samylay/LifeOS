// Shared category metadata for the /decide surfaces (triage card). One
// source of truth: semantic/chart tokens instead of the hex literals both
// files used to carry, lucide icons instead of emoji.
import { Code2, Link2, CircleDollarSign, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface CategoryMeta {
  label: string;
  color: string; // CSS color value (token var)
  icon: LucideIcon;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  "business-idea": { label: "Business idea", color: "var(--warning)", icon: CircleDollarSign },
  "ai-tip": { label: "AI tip", color: "var(--chart-4)", icon: Sparkles },
  "ai-project": { label: "AI project", color: "var(--chart-4)", icon: Wrench },
  swe: { label: "SWE", color: "var(--primary)", icon: Code2 },
  other: { label: "Link", color: "var(--muted-foreground)", icon: Link2 },
};

export function categoryMeta(category?: string): CategoryMeta {
  return CATEGORY_META[category ?? "other"] ?? CATEGORY_META.other;
}
