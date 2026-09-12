export const ESSAY_GENRES = [
  "argumentative",
  "analytical",
  "explanatory",
  "personal",
  "literary-analysis",
  "research",
  "general",
] as const;

export type EssayGenre = (typeof ESSAY_GENRES)[number];

export const DIMENSIONS = [
  { id: "task", label: "Task & scope", weight: 15 },
  { id: "thesis", label: "Thesis & stakes", weight: 12 },
  { id: "reasoning", label: "Reasoning & depth", weight: 18 },
  { id: "evidence", label: "Evidence", weight: 15 },
  { id: "organization", label: "Organization", weight: 13 },
  { id: "counterargument", label: "Counterargument", weight: 7 },
  { id: "style", label: "Audience & style", weight: 8 },
  { id: "clarity", label: "Clarity & mechanics", weight: 7 },
  { id: "insight", label: "Originality & insight", weight: 5 },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];
export type ReviewStatus = "strong" | "developing" | "needs-work" | "not-applicable" | "cannot-assess";
export type Confidence = "high" | "medium" | "low";

export interface EssayInput {
  title: string;
  prompt: string;
  genre: EssayGenre;
  audience: string;
  constraints: string;
  essay: string;
}

export interface EssayFinding {
  quote: string;
  issue: string;
  whyItMatters: string;
  revision: string;
  confidence: Confidence;
}

export interface DimensionReview {
  id: DimensionId;
  status: ReviewStatus;
  summary: string;
  findings: EssayFinding[];
}

export interface EssayReview {
  verdict: "on-track" | "revise" | "rethink" | "cannot-assess";
  summary: string;
  priorities: Array<{ dimension: DimensionId; title: string; reason: string; action: string }>;
  outline: Array<{ paragraph: number; job: string; contribution: string }>;
  dimensions: DimensionReview[];
}

const STATUSES = new Set<ReviewStatus>(["strong", "developing", "needs-work", "not-applicable", "cannot-assess"]);
const CONFIDENCES = new Set<Confidence>(["high", "medium", "low"]);
const IDS = new Set<DimensionId>(DIMENSIONS.map((dimension) => dimension.id));
const VERDICTS = new Set<EssayReview["verdict"]>(["on-track", "revise", "rethink", "cannot-assess"]);
const text = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

export function validateEssayInput(value: unknown): EssayInput {
  if (!value || typeof value !== "object") throw new Error("Add an essay to review.");
  const raw = value as Record<string, unknown>;
  const essay = text(raw.essay, 60_000);
  const genre = ESSAY_GENRES.includes(raw.genre as EssayGenre) ? raw.genre as EssayGenre : "general";
  if (wordCount(essay) < 50) throw new Error("Add at least 50 words so the review has enough evidence.");
  return {
    title: text(raw.title, 160),
    prompt: text(raw.prompt, 4_000),
    genre,
    audience: text(raw.audience, 500),
    constraints: text(raw.constraints, 2_000),
    essay,
  };
}

export function validateEssayReview(value: unknown, input: EssayInput): EssayReview {
  if (!value || typeof value !== "object") throw new Error("The reviewer returned an invalid response.");
  const raw = value as Record<string, unknown>;
  const verdict = VERDICTS.has(raw.verdict as EssayReview["verdict"]) ? raw.verdict as EssayReview["verdict"] : "cannot-assess";
  const rawDimensions = Array.isArray(raw.dimensions) ? raw.dimensions : [];
  const byId = new Map<DimensionId, DimensionReview>();

  for (const candidate of rawDimensions) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (!IDS.has(item.id as DimensionId) || byId.has(item.id as DimensionId)) continue;
    const findings = (Array.isArray(item.findings) ? item.findings : []).flatMap((entry): EssayFinding[] => {
      if (!entry || typeof entry !== "object") return [];
      const finding = entry as Record<string, unknown>, quote = text(finding.quote, 600);
      if (!quote || !input.essay.includes(quote)) return [];
      return [{
        quote,
        issue: text(finding.issue, 500),
        whyItMatters: text(finding.whyItMatters, 500),
        revision: text(finding.revision, 500),
        confidence: CONFIDENCES.has(finding.confidence as Confidence) ? finding.confidence as Confidence : "low",
      }];
    }).filter((finding) => finding.issue && finding.whyItMatters && finding.revision).slice(0, 3);
    byId.set(item.id as DimensionId, {
      id: item.id as DimensionId,
      status: STATUSES.has(item.status as ReviewStatus) ? item.status as ReviewStatus : "cannot-assess",
      summary: text(item.summary, 600) || "The reviewer could not assess this dimension.",
      findings,
    });
  }

  const priorities = (Array.isArray(raw.priorities) ? raw.priorities : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>, dimension = item.dimension as DimensionId;
    if (!IDS.has(dimension)) return [];
    const priority = { dimension, title: text(item.title, 160), reason: text(item.reason, 500), action: text(item.action, 500) };
    return priority.title && priority.reason && priority.action ? [priority] : [];
  }).slice(0, 3);

  const outline = (Array.isArray(raw.outline) ? raw.outline : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>, paragraph = Number(item.paragraph);
    if (!Number.isInteger(paragraph) || paragraph < 1) return [];
    const row = { paragraph, job: text(item.job, 300), contribution: text(item.contribution, 400) };
    return row.job && row.contribution ? [row] : [];
  }).slice(0, 80);

  return {
    verdict,
    summary: text(raw.summary, 1200) || "The reviewer could not form a reliable overall diagnosis.",
    priorities,
    outline,
    dimensions: DIMENSIONS.map((dimension) => byId.get(dimension.id) ?? ({
      id: dimension.id,
      status: "cannot-assess",
      summary: "The reviewer did not assess this dimension.",
      findings: [],
    })),
  };
}
