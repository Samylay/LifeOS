// T-content-rework-02 — three states, not five.
//
// The old pipeline was idea → scripted → recorded → edited → posted. In 18
// ideas over six weeks, "recorded" and "edited" were never once set: the
// bookkeeping asked for status updates on work that was not happening.
//
// What is left means something. `ready` is "I could film this now", which is
// the only distinction that changes what Samy does next.
import type { ContentIdea } from "@/lib/types";

export type IdeaStatus = "idea" | "ready" | "posted";

export const IDEA_STATUSES: { status: IdeaStatus; label: string; color: string }[] = [
  { status: "idea", label: "Idea", color: "var(--muted-foreground)" },
  { status: "ready", label: "Ready to film", color: "var(--primary)" },
  { status: "posted", label: "Posted", color: "var(--success)" },
];

// Every legacy status maps onto one of the three. `scripted`, `recorded` and
// `edited` all meant "further along than an idea, not yet out", which is
// exactly what `ready` means now — so nothing is lost and nothing is
// invented. An unrecognised value falls back to `idea`: the bank keeps the
// row rather than dropping it over a status nobody remembers writing.
export function migrateStatus(legacy: string | undefined): IdeaStatus {
  switch (legacy) {
    case "posted":
      return "posted";
    case "ready":
    case "scripted":
    case "recorded":
    case "edited":
      return "ready";
    default:
      return "idea";
  }
}

export function needsStatusMigration(idea: Pick<ContentIdea, "status">): boolean {
  return migrateStatus(idea.status as string) !== (idea.status as string);
}

// One advance button per card. Posting is the end of the line here — Samy
// posts by hand, so the app only records that he did.
export const NEXT_STATUS: Partial<Record<IdeaStatus, { next: IdeaStatus; label: string }>> = {
  idea: { next: "ready", label: "Ready to film" },
  ready: { next: "posted", label: "Posted" },
};
