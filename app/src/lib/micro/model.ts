export const PLATFORMS = ["web", "ios", "android", "ios-android"] as const;
export type Platform = typeof PLATFORMS[number];
export interface Feature { id: string; title: string; scope: "first" | "later"; acceptance: string }
export interface AppBrief {
  title: string; audience: string; problem: string; platform: Platform;
  features: Feature[]; name: string; vibe: string; references: string; business: string;
}
export interface MicroApp extends AppBrief {
  id: string; revision: number; createdAt: string; updatedAt: string;
  researchSession?: string; workspaceSession?: string;
}
export const EMPTY_BRIEF: AppBrief = { title: "", audience: "", problem: "", platform: "web", features: [], name: "", vibe: "", references: "", business: "" };
export const STAGES = ["Features", "Name", "Vibe", "References", "Build"] as const;
export function briefFromApp(app: AppBrief): AppBrief {
  const { title, audience, problem, platform, features, name, vibe, references, business } = app;
  return { title, audience, problem, platform, features, name, vibe, references, business };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supply an app brief.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`Check ${field}.`);
  return value.trim();
}
export function parseBrief(value: unknown): AppBrief {
  const v = record(value);
  if (!PLATFORMS.includes(v.platform as Platform)) throw new Error("Choose a platform.");
  if (!Array.isArray(v.features) || v.features.length > 60) throw new Error("Keep the feature list to 60 items.");
  const features = v.features.map((value): Feature => {
    const f = record(value);
    if (f.scope !== "first" && f.scope !== "later") throw new Error("Choose a feature scope.");
    const id = text(f.id, "feature ID", 80, true);
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid feature ID.");
    return { id, scope: f.scope, title: text(f.title, "feature title", 200, true), acceptance: text(f.acceptance, "acceptance", 1500) };
  });
  if (new Set(features.map(f => f.id)).size !== features.length) throw new Error("Feature IDs must be distinct.");
  const brief: AppBrief = {
    title: text(v.title, "working title", 100, true), audience: text(v.audience, "audience", 1000), problem: text(v.problem, "problem", 2000),
    platform: v.platform as Platform, features, name: text(v.name, "name", 100), vibe: text(v.vibe, "vibe", 3000),
    references: text(v.references, "references", 18000), business: text(v.business, "business model", 2000),
  };
  if (JSON.stringify(brief).length > 30000) throw new Error("Keep the brief under 30,000 characters. Put longer evidence in linked references.");
  return brief;
}
export function buildGaps(brief: AppBrief): string[] {
  const gaps: string[] = [];
  if (!brief.audience) gaps.push("Who is the app for?");
  if (!brief.problem) gaps.push("What problem does it solve?");
  const first = brief.features.filter(f => f.scope === "first");
  if (!first.length) gaps.push("Pick at least one first-release feature.");
  if (first.some(f => !f.acceptance)) gaps.push("Describe how to verify each first-release feature.");
  if (!brief.name) gaps.push("Choose an app name.");
  if (!brief.vibe) gaps.push("Choose a visual direction.");
  if (!brief.references) gaps.push("Attach design references or record why none apply.");
  return gaps;
}
export function workspaceSlug(id: string) { return `app-${id}`; }
export function briefMarkdown(app: AppBrief): string {
  return `# ${app.name || app.title}\n\nWorking title: ${app.title}\nPlatform: ${app.platform}\n\n## Audience\n${app.audience}\n\n## Problem\n${app.problem}\n\n## First release\n${app.features.filter(f => f.scope === "first").map(f => `- ${f.title}\n  Acceptance: ${f.acceptance}`).join("\n")}\n\n## Later\n${app.features.filter(f => f.scope === "later").map(f => `- ${f.title}`).join("\n")}\n\n## Visual direction\n${app.vibe}\n\n## References and research\n${app.references}\n\n## Business model\n${app.business}\n`;
}
