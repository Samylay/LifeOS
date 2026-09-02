// T-decide-rework-03 — the closed, parameterized action set a /decide verdict
// can trigger. Pure module: no I/O, no imports of db/fs/network. This is the
// trust boundary for the rework (spec.md "Trust boundary"): a verdict always
// selects an action id with typed parameters, never a free-form string that
// could carry ingested text into an agent instruction.
//
// `TriageProposal.destination` (vault | idea-bank | backlog:<centre> |
// roadmap:<project> | discard) is the proto-action-menu this supersedes.
// `legacyDestinationToAction` maps every existing string onto exactly one
// action id so the 613 existing triage items keep loading.
import type { TriageItem } from "@/lib/triage";

export type ActionId =
  | "file-vault"
  | "file-idea-bank"
  | "file-backlog"
  | "file-roadmap"
  | "discard"
  | "hold-for-review";

export interface ActionDescriptor {
  id: ActionId;
  label: string;
  // Generic, plain-language description of what this action does — not tied
  // to a specific item. describeEffect() below produces the per-item sentence.
  effect: string;
}

// The closed set. Adding an action is a single, testable change here — no
// branching UI code anywhere else should decide what an action does.
export const ACTIONS: readonly ActionDescriptor[] = [
  {
    id: "file-vault",
    label: "File to vault",
    effect: "Writes the item as a reference note in the vault.",
  },
  {
    id: "file-idea-bank",
    label: "Add to idea bank",
    effect: "Creates a new content idea from the item.",
  },
  {
    id: "file-backlog",
    label: "Add to backlog",
    effect: "Appends the item as a task to a centre's backlog.",
  },
  {
    id: "file-roadmap",
    label: "File to ROADMAP",
    effect: "Files the item as a task on a project's ROADMAP.",
  },
  {
    id: "discard",
    label: "Discard",
    effect: "Drops the item — no record kept beyond the triage log.",
  },
  {
    id: "hold-for-review",
    label: "Hold for review",
    effect:
      "Takes no action. Safe no-op used when an item's intended destination could not be recognised.",
  },
] as const;

// A concrete, instantiated action: id + its typed parameters. Every param is
// a named struct field, never a bare opaque string handed to an agent.
export type Action =
  | { id: "file-vault"; params: Record<string, never> }
  | { id: "file-idea-bank"; params: Record<string, never> }
  | { id: "file-backlog"; params: { centre: string } }
  | { id: "file-roadmap"; params: { project: string } }
  | { id: "discard"; params: Record<string, never> }
  | { id: "hold-for-review"; params: Record<string, never> };

const NO_PARAMS: Record<string, never> = {};

type EligibilityPredicate = (item: TriageItem) => boolean;

// Data-driven eligibility table — which of the closed actions an item may
// take, derived from its source, category, and assessment. Order here is the
// order eligibleActions() returns. "hold-for-review" is intentionally never
// offered here: it only ever appears as the legacy-mapping safe fallback.
const ELIGIBILITY: ReadonlyArray<[Exclude<ActionId, "hold-for-review">, EligibilityPredicate]> = [
  // A reference note always makes sense, regardless of source/category.
  ["file-vault", () => true],
  // Content fodder: an explicit business-idea call, or anything captured
  // from a social source (x/instagram) — the material the idea bank exists for.
  [
    "file-idea-bank",
    (item) =>
      item.proposal?.category === "business-idea" ||
      item.source === "x" ||
      item.source === "instagram",
  ],
  // Learning-centre categories only.
  [
    "file-backlog",
    (item) => {
      const category = item.proposal?.category;
      return category === "ai-tip" || category === "ai-project" || category === "swe";
    },
  ],
  // Only offered once the assessment names a concrete first step to apply.
  [
    "file-roadmap",
    (item) => {
      const apply = item.proposal?.assessment?.apply?.trim().toLowerCase();
      return !!apply && apply !== "none";
    },
  ],
  // Rejecting stays available for anything.
  ["discard", () => true],
];

export function eligibleActions(item: TriageItem): ActionId[] {
  return ELIGIBILITY.filter(([, predicate]) => predicate(item)).map(([id]) => id);
}

function itemTitle(item: TriageItem): string {
  const title = item.proposal?.title?.trim();
  if (title) return title;
  const summary = item.proposal?.summary?.trim();
  if (summary) return summary;
  const url = item.url?.trim();
  if (url) return url;
  return "this item";
}

// The plain-language sentence shown before approval. Must never return an
// empty string — describeEffect always has a title fallback and a case for
// every ActionId in the closed set.
export function describeEffect(action: Action, item: TriageItem): string {
  const title = itemTitle(item);
  switch (action.id) {
    case "file-vault":
      return `Writes "${title}" as a reference note in the vault.`;
    case "file-idea-bank":
      return `Adds "${title}" to the content idea bank as a new idea.`;
    case "file-backlog":
      return `Appends "${title}" to the ${action.params.centre} backlog as a task to revisit.`;
    case "file-roadmap":
      return `Files "${title}" as a task on the ${action.params.project} ROADMAP.`;
    case "discard":
      return `Discards "${title}" — no record kept beyond the triage log.`;
    case "hold-for-review":
      return `Takes no action on "${title}" — its destination could not be recognised, so it is held for manual review.`;
  }
}

// Every existing TriageProposal.destination string maps onto exactly one
// action id with typed parameters. An unrecognised string is a safe no-op —
// it never throws, so a malformed or future-format legacy string can't crash
// the read path for the 613 existing items.
export function legacyDestinationToAction(destination: string): Action {
  const d = (destination ?? "").trim();

  if (d === "vault") return { id: "file-vault", params: NO_PARAMS };
  if (d === "idea-bank") return { id: "file-idea-bank", params: NO_PARAMS };
  if (d === "discard") return { id: "discard", params: NO_PARAMS };

  const backlogMatch = d.match(/^backlog:(.+)$/i);
  if (backlogMatch) {
    const centre = backlogMatch[1].trim().toLowerCase();
    if (centre) return { id: "file-backlog", params: { centre } };
    return { id: "hold-for-review", params: NO_PARAMS };
  }

  const roadmapMatch = d.match(/^roadmap:(.+)$/i);
  if (roadmapMatch) {
    const project = roadmapMatch[1].trim().toLowerCase();
    if (project) return { id: "file-roadmap", params: { project } };
    return { id: "hold-for-review", params: NO_PARAMS };
  }

  return { id: "hold-for-review", params: NO_PARAMS };
}
