// T24 — daily-planning checkpoint card, folding T20–T23 into the brief.
// See ~/loop-me/workflows/daily-planning.md "Checkpoint".
//
// On each brief build: ensure today's tentative blocks exist on the live
// calendar (writes them via T23's writer only if none are there yet, so a
// force-rebuilt brief never duplicates events), then present: the day's
// tentative blocks (already live — no reply needed for them to stand),
// low-confidence Todoist placements as questions, and the open invite.
// Replies land on POST /api/plan/reply (parsed by ../plan-reply.ts).
import { todayInTz } from "../tz";
import { listEventsForDay, isGoogleCalendarConfigured } from "../../google-calendar";
import { TENTATIVE_PREFIX } from "../tentative-blocks";
import { writeTentativeBlocksForToday } from "./calendar-blocks";
import { fetchTodoistTasksWithCentres } from "./todoist-centres";
import { card, type FetchResult } from "../registry";

const MAX_PLACEMENTS = 5;

export interface PlanningBody {
  date: string;
  blocks: { eventId: string; title: string; startIso: string; endIso: string }[];
  wrote: boolean; // whether this run created the tentative events
  write_failed: number;
  placements: { id: string; content: string }[];
  placements_error: string | null;
  invite: string;
}

export async function fetch(): Promise<FetchResult> {
  if (!isGoogleCalendarConfigured()) {
    return card({
      id: "planning", type: "planning", priority: "action", status: "amber",
      title: "Today's plan",
      body: { error_hint: "Google Calendar not configured — no blocks written" },
    });
  }

  const { dateStr } = todayInTz();
  let events = await listEventsForDay(dateStr);
  if (events === null) throw new Error("failed to read calendar");

  let wrote = false;
  let writeFailed = 0;
  if (!events.some((e) => e.summary.startsWith(TENTATIVE_PREFIX))) {
    const result = await writeTentativeBlocksForToday();
    wrote = true;
    writeFailed = result.failed.length;
    events = (await listEventsForDay(dateStr)) ?? events;
  }

  const blocks = events
    .filter((e) => e.summary.startsWith(TENTATIVE_PREFIX))
    .map((e) => ({ eventId: e.id, title: e.summary, startIso: e.startIso, endIso: e.endIso }));

  // Placements are best-effort: a Todoist outage degrades the card, never
  // kills it (the blocks are the load-bearing half).
  let placements: PlanningBody["placements"] = [];
  let placementsError: string | null = null;
  try {
    placements = (await fetchTodoistTasksWithCentres())
      .filter((t) => t.confidence === "low")
      .slice(0, MAX_PLACEMENTS)
      .map((t) => ({ id: t.id, content: t.content }));
  } catch (e) {
    placementsError = e instanceof Error ? e.message : String(e);
  }

  const body: PlanningBody = {
    date: dateStr,
    blocks,
    wrote,
    write_failed: writeFailed,
    placements,
    placements_error: placementsError,
    invite:
      "Blocks stand as-is if you do nothing. Reply to adjust: \"push <block> to 6pm\", \"skip <block> today\", \"schedule <task> at 4pm\", \"add <thing> at 5pm\".",
  };

  return card({
    id: "planning", type: "planning", priority: "action",
    status: writeFailed > 0 ? "amber" : "neutral",
    title: "Today's plan",
    link: "/pager",
    body: body as unknown as Record<string, unknown>,
  });
}
