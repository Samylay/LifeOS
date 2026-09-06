// Shared shape of brief.json, produced by the aggregator (~/services/brief on
// the host) and consumed by both the /brief card page and the Telegram render.
// The renderer is domain-agnostic: it only relies on the envelope fields below;
// `body` is interpreted per `type` by the card components.

export type CardPriority = "action" | "state";
export type CardStatus = "green" | "amber" | "red" | "neutral";

export interface BriefCard {
  id: string;
  type: string;
  priority: CardPriority;
  status: CardStatus;
  title: string;
  body: Record<string, unknown>;
  link: string | null;
  error: string | null;
}

export interface Brief {
  date: string; // YYYY-MM-DD
  generated_at: string; // ISO timestamp
  cards: BriefCard[];
}

// --- type-specific bodies (kept in sync with the aggregator's fetchers) ---
// today-brief-rework 01 dropped the workout, homelab, ships and prompt cards
// (and their body types) along with the fetchers that produced them — see
// registry.ts.

export interface WorkBody {
  tasks: { content: string; due?: string; priority?: number; url?: string }[];
  events: { title: string; start: string; end?: string }[];
  // T31 feedback leg: Todoist tasks completed since yesterday 00:00 BRIEF_TZ.
  // Optional/absent when the completed fetch fails (card degrades gracefully).
  completed_yesterday?: { count: number; items: string[] };
}

export interface TriageBody {
  source: string; // "x" | "instagram" | "other" — this card's slice
  keep: { n: number; id: string; url: string; source: string; summary: string; destination: string; confidence: string; rationale: string }[];
  drop: { n: number; id: string; url: string; source: string; summary: string; destination: string; confidence: string; rationale: string }[];
  total: number;
  shown: number;
  hint: string;
}

export interface FuiteBody {
  entries: { org: string; status: "green" | "orange" | "red"; data_types: string[]; url?: string }[];
}

export interface FtHeadlinesBody {
  edition_date: string;
  headlines: { text: string; topics: string[] }[];
}
