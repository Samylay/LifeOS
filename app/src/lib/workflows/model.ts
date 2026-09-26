/** Shared workflow vocabulary. A source may feed several independent uses. */
export const WORKFLOW_KINDS = ["auto", "design", "skill", "tool", "recipe", "training", "learning", "teaching", "content", "music", "reference"] as const;
export type WorkflowKind = typeof WORKFLOW_KINDS[number];
export const WORKFLOW_META: Record<WorkflowKind, { label: string; output: string; href: string }> = {
  auto: { label: "Choose for me", output: "A workflow grounded in the extracted source", href: "/workflows" },
  design: { label: "Design inspiration", output: "Side-by-side visuals, or a video for motion", href: "/projects" },
  skill: { label: "Skill", output: "Controlled comparison and a pinned install or merge proposal", href: "/projects" },
  tool: { label: "Tool or framework", output: "An isolated trial, demonstration, and integration proposal", href: "/projects" },
  recipe: { label: "Recipe", output: "Ingredients, method, and the original source", href: "/recipes" },
  training: { label: "Training", output: "A sourced exercise or program proposal to review", href: "/workouts" },
  learning: { label: "Learn something", output: "Material linked to an existing learning intention", href: "/knowledge" },
  teaching: { label: "Teach others", output: "An editable lesson outline and exercise", href: "/teaching" },
  content: { label: "Content idea", output: "An angle or draft with sources", href: "/content" },
  music: { label: "Music", output: "The musical reference and relevant observations", href: "/knowledge" },
  reference: { label: "Keep as reference", output: "A grounded reference, with no experiment required", href: "/knowledge" },
};
export const WORKFLOW_STATES = ["awaiting-extraction", "queued", "running", "ready", "applying", "applied", "kept", "blocked", "dismissed"] as const;
export type WorkflowState = typeof WORKFLOW_STATES[number];
export const STATE_LABEL: Record<WorkflowState, string> = {
  "awaiting-extraction": "Waiting for extraction", queued: "Waiting for agent", running: "In progress", ready: "Ready for your call",
  applying: "Applying your decision", applied: "Applied", kept: "Reference kept", blocked: "Needs attention", dismissed: "Dismissed",
};
export const EFFECTS = ["keep-reference", "save-recipe", "save-content", "save-lesson", "propose-training", "install-skill", "merge-skill", "integrate-tool"] as const;
export type EffectKind = typeof EFFECTS[number];
export interface PreparedEffect {
  kind: EffectKind;
  label: string;
  consequence: string;
  target: string;
  repository?: string;
  commit?: string;
  sourcePath?: string;
}
export interface WorkflowArtifact { id: string; name: string; kind: "image" | "video" | "text"; mime: string; bytes: number; sha256: string; href: string }
export interface WorkflowReport {
  kind: Exclude<WorkflowKind, "auto">;
  outcome: "pass" | "fail" | "inconclusive" | "reference";
  summary: string;
  findings: string[];
  limitations: string[];
  metrics: { label: string; control?: number; treatment: number; unit: string }[];
  artifactIds: string[];
  effect: PreparedEffect;
  prepared?: PreparedMaterial;
}
export interface WorkflowRun {
  id: string; itemId: string; title: string; sourceUrl: string; kind: WorkflowKind;
  state: WorkflowState; phase: "evaluate" | "apply"; evidenceRef: string | null;
  createdAt: string; updatedAt: string; dispatchId?: string; reason?: string;
  artifacts: WorkflowArtifact[]; report?: WorkflowReport; reportHash?: string;
  appliedSummary?: string; destination?: string; outcomeEvidence?: string[];
  history: { state: WorkflowState; at: string; detail: string }[];
}
export function isWorkflowKind(value: unknown): value is WorkflowKind { return typeof value === "string" && WORKFLOW_KINDS.includes(value as WorkflowKind); }
export function safeSourceUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
export interface PreparedMaterial {
  title: string;
  body: string;
  recipe?: { name: string; ingredients: { name: string; quantity?: string }[]; steps: string[]; servings?: number; prepMinutes?: number };
}

export const EFFECT_LABEL: Record<EffectKind, string> = {
  "keep-reference": "Keep reference", "save-recipe": "Save recipe", "save-content": "Save content draft", "save-lesson": "Save teaching material", "propose-training": "Save training proposal", "install-skill": "Install evaluated skill", "merge-skill": "Merge into existing skill", "integrate-tool": "Integrate evaluated tool",
};
export function effectConsequence(effect: PreparedEffect): string {
  switch (effect.kind) {
    case "keep-reference": return "Keep this result and its source in Knowledge. No installation or external action.";
    case "save-recipe": return "Create a recipe with the reviewed ingredients and steps. Keep the source link.";
    case "save-content": return "Create a draft in Content. Nothing is published.";
    case "save-lesson": return "Save this material in Teaching. Your course structure stays editable and is not replaced.";
    case "propose-training": return "Save a proposal in Training. Your current program and watch stay unchanged.";
    case "install-skill": return `Ask the host agent to install the reviewed skill as ${effect.target}, from the exact repository commit shown below. Completion appears after its verification report.`;
    case "merge-skill": return `Ask the host agent to merge the reviewed material into ${effect.target}, preserving existing edits. Completion appears after its verification report.`;
    case "integrate-tool": return `Ask the host agent to integrate the reviewed tool for ${effect.target}, using the pinned version. Any blocked dependency or configuration change is reported before proceeding.`;
  }
}
