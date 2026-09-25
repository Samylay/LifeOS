export type MindMapKind = "focus" | "context" | "project" | "learning" | "goal" | "improvement";
export type MindMapGroup = "focus" | "school" | "apps" | "lifeos" | "ai" | "growth";

export interface MindMapNode {
  id: string;
  label: string;
  kind: MindMapKind;
  group: MindMapGroup;
  summary: string;
  x: number;
  y: number;
}

export interface MindMapEdge {
  source: string;
  target: string;
  kind?: "related";
}

// Generic sample graph. Keep this data seam separate so a later vault adapter
// can replace the sample without changing the graph UI.
export const MIND_MAP_NODES: MindMapNode[] = [
  { id: "focus", label: "Product focus", kind: "focus", group: "focus", summary: "A product goal connected to its projects and supporting knowledge.", x: 500, y: 285 },
  { id: "school", label: "Product design", kind: "context", group: "school", summary: "Define a clear problem and the outcome a product should deliver.", x: 300, y: 135 },
  { id: "robotics", label: "Systems design", kind: "learning", group: "school", summary: "Learn how components and constraints shape a reliable system.", x: 110, y: 76 },
  { id: "school-project", label: "Discovery notes", kind: "project", group: "school", summary: "Collect requirements, assumptions, and decisions for a project.", x: 125, y: 201 },
  { id: "drone-payload", label: "Reliable product", kind: "goal", group: "school", summary: "Turn product requirements into an outcome that can be evaluated.", x: 402, y: 48 },
  { id: "apps", label: "Platform", kind: "context", group: "apps", summary: "The technical foundation that supports the product experience.", x: 650, y: 112 },
  { id: "budget-app", label: "Release planning", kind: "project", group: "apps", summary: "Plan a small, reviewable release for a software product.", x: 487, y: 49 },
  { id: "ios", label: "Accessibility", kind: "learning", group: "apps", summary: "Learn practical accessibility checks for interactive software.", x: 806, y: 56 },
  { id: "siri-ai", label: "Integrations", kind: "learning", group: "apps", summary: "Connect a product to external services through stable interfaces.", x: 835, y: 157 },
  { id: "lifeos", label: "Data workflows", kind: "context", group: "lifeos", summary: "Move information through a product while preserving its meaning.", x: 785, y: 280 },
  { id: "learning-space", label: "Guided learning", kind: "improvement", group: "lifeos", summary: "Make it easy to move from a question to a useful explanation.", x: 938, y: 205 },
  { id: "social-ingestion", label: "Source ingestion", kind: "improvement", group: "lifeos", summary: "Collect external material with clear provenance and review steps.", x: 945, y: 350 },
  { id: "ai-craft", label: "Quality", kind: "context", group: "ai", summary: "Improve product quality with evaluation, retrieval, and clear data models.", x: 620, y: 443 },
  { id: "anthropic-cert", label: "Evaluation methods", kind: "learning", group: "ai", summary: "Learn ways to assess model behavior against defined expectations.", x: 449, y: 501 },
  { id: "evaluations", label: "Test fixtures", kind: "project", group: "ai", summary: "Create representative test cases for product behavior.", x: 582, y: 500 },
  { id: "rag", label: "Retrieval", kind: "learning", group: "ai", summary: "Learn how search and retrieved context support generated answers.", x: 748, y: 504 },
  { id: "design-systems", label: "Data models", kind: "learning", group: "ai", summary: "Learn how to represent concepts and relationships in an app.", x: 842, y: 421 },
  { id: "growth", label: "Communication", kind: "context", group: "growth", summary: "Help people understand a product and use it with confidence.", x: 285, y: 430 },
  { id: "marketing", label: "User research", kind: "learning", group: "growth", summary: "Learn how to gather useful feedback from product users.", x: 133, y: 363 },
  { id: "personal-brand", label: "Product writing", kind: "project", group: "growth", summary: "Write clear explanations and examples for a product.", x: 126, y: 490 },
];

export const MIND_MAP_EDGES: MindMapEdge[] = [
  { source: "focus", target: "school" }, { source: "focus", target: "apps" },
  { source: "focus", target: "lifeos" }, { source: "focus", target: "ai-craft" },
  { source: "focus", target: "growth" },
  { source: "school", target: "robotics" }, { source: "school", target: "school-project" },
  { source: "school", target: "drone-payload" }, { source: "robotics", target: "drone-payload", kind: "related" },
  { source: "apps", target: "budget-app" }, { source: "apps", target: "ios" },
  { source: "apps", target: "siri-ai" }, { source: "budget-app", target: "ios", kind: "related" },
  { source: "budget-app", target: "siri-ai", kind: "related" },
  { source: "lifeos", target: "learning-space" }, { source: "lifeos", target: "social-ingestion" },
  { source: "ai-craft", target: "anthropic-cert" }, { source: "ai-craft", target: "evaluations" },
  { source: "ai-craft", target: "rag" }, { source: "ai-craft", target: "design-systems" },
  { source: "growth", target: "marketing" }, { source: "growth", target: "personal-brand" },
];

export const MIND_MAP_GROUPS: { id: Exclude<MindMapGroup, "focus">; label: string; color: string }[] = [
  { id: "school", label: "Product", color: "var(--chart-4)" },
  { id: "apps", label: "Platform", color: "var(--chart-3)" },
  { id: "lifeos", label: "Workflows", color: "var(--chart-2)" },
  { id: "ai", label: "Quality", color: "var(--chart-5)" },
  { id: "growth", label: "Communication", color: "var(--destructive)" },
];

export const MIND_MAP_BY_ID = new Map(MIND_MAP_NODES.map((node) => [node.id, node]));
export const MIND_MAP_OUTGOING = (id: string) => MIND_MAP_EDGES.filter((edge) => edge.source === id || edge.target === id);
