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

export interface WorkoutBody {
  rest: boolean;
  day_label?: string;
  exercises: { name: string; sets: number; reps: string }[];
}

export interface WorkBody {
  tasks: { content: string; due?: string; priority?: number; url?: string }[];
  events: { title: string; start: string; end?: string }[];
  // T31 feedback leg: Todoist tasks completed since yesterday 00:00 BRIEF_TZ.
  // Optional/absent when the completed fetch fails (card degrades gracefully).
  completed_yesterday?: { count: number; items: string[] };
}

export interface HomelabBody {
  summary: string;
  containers_up: number;
  containers_total: number;
  disk_pct: number | null;
  tailscale_ok: boolean;
  ollama_ok: boolean;
  // Standing goals (~/infra/goals) — optional: absent in briefs generated
  // before 2026-07-07, and goals_enabled=false when Prometheus has no metrics.
  goals_enabled?: boolean;
  goals_ok?: number;
  goals_total?: number;
  goals_violated?: string[];
  goals_flapped_24h?: string[];
  issues: string[];
}

export interface ShipsBody {
  projects: { title: string; days: number; never_shipped: boolean; shipping_event: string | null }[];
  shipped_30d: number;
  tripwire: boolean; // zero ships in 30 days with active projects
}

export interface FuiteBody {
  entries: { org: string; status: "green" | "orange" | "red"; data_types: string[]; url?: string }[];
}

export interface FtHeadlinesBody {
  edition_date: string;
  headlines: { text: string; topics: string[] }[];
}

export interface PromptBody {
  prompt_text: string;
  category: string; // "journaling" | "spoken-english" | recurring slug
  inbox_note: string; // vault-relative path transcripts append to
}
