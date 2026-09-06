// T-content-rework-03 — the playbook stops being constants and becomes
// records Samy owns.
//
// Content types and hook formulas were frozen in code as fuel for a
// generator. The generator is gone, and the playbook is the part worth
// keeping: it should grow as he invents new angles rather than freezing at
// whatever three pillars existed the day it was written.
//
// THE PILLAR KEYS ARE LOAD-BEARING. `under-the-hood`, `build-log` and
// `workflow-win` are wired into content/weekly-batch.ts, its tests and the
// weekly scheduler, and 18 live ideas reference them (12/3/3). Labels and
// meanings are Samy's to edit; a migration that changes a KEY silently
// orphans his bank, so the tests below assert they survive verbatim.
import { PILLARS, HOOK_FORMULAS } from "@/lib/content-os";

export interface ContentType {
  id?: string;
  key: string;
  label: string;
  short: string;
  job: string;
  color: string;
  order: number;
}

export interface HookFormula {
  id?: string;
  n: number;
  name: string;
  template: string;
}

// The bucket for ideas with no type. /decide files idea-bank cards with
// `pillar: ""`, and that path is live — an untyped idea is normal, not an
// error, and is never blocked by the absence of a type.
export const UNSORTED = "";
export const UNSORTED_LABEL = "Unsorted";

// Seeds from today's constants so the catalog starts populated rather than
// empty. Labels and meanings are exactly what is live now: this is a change
// of custody, not of content.
export function seedContentTypes(): ContentType[] {
  return PILLARS.map((p, i) => ({
    key: p.pillar,
    label: p.label,
    short: p.short,
    job: p.job,
    color: p.color,
    order: i,
  }));
}

export function seedHookFormulas(): HookFormula[] {
  return HOOK_FORMULAS.map((h) => ({ n: h.n, name: h.name, template: h.template }));
}

export function sortTypes(types: ContentType[]): ContentType[] {
  return [...types].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

// An idea whose key is not in the catalog still resolves to something
// nameable. Losing the label must never mean losing the idea.
export function resolveType(key: string | undefined, types: ContentType[]): ContentType | null {
  if (!key) return null;
  return types.find((t) => t.key === key) ?? null;
}

export function typeLabel(key: string | undefined, types: ContentType[]): string {
  if (!key) return UNSORTED_LABEL;
  return resolveType(key, types)?.label ?? key;
}

export interface TypeCount {
  key: string;
  label: string;
  count: number;
}

// Counts per type, so a thin area of the channel shows. Unsorted is included
// only when it has ideas in it — an empty bucket is not a chore.
export function countByType(
  ideas: { pillar?: string }[],
  types: ContentType[],
): TypeCount[] {
  const counts = new Map<string, number>();
  for (const idea of ideas) {
    const key = idea.pillar ?? UNSORTED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: TypeCount[] = sortTypes(types).map((t) => ({
    key: t.key,
    label: t.label,
    count: counts.get(t.key) ?? 0,
  }));
  // Keys that exist on ideas but not in the catalog, so an idea can never
  // vanish from the counts because its type was renamed away.
  for (const [key, count] of counts) {
    if (key === UNSORTED) continue;
    if (!out.some((t) => t.key === key)) out.push({ key, label: key, count });
  }
  const unsorted = counts.get(UNSORTED) ?? 0;
  if (unsorted > 0) out.push({ key: UNSORTED, label: UNSORTED_LABEL, count: unsorted });
  return out;
}
