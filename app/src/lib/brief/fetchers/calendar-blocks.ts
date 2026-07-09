// T23: reads the day's existing Google Calendar events, computes tentative
// time blocks per daily-planning's prioritization rules, and writes them
// live to the primary calendar. Not wired into the brief registry yet —
// T24 is the checkpoint task that folds this into the Morning Brief.
//
// Dynamic-priority items are T22's tracked-centre aggregator only (ranked
// violation > needs-samy > next-task) for this pass. T21's Todoist tasks are
// deliberately excluded from auto-placement: the spec requires a task have a
// scheduled date to be auto-blocked, and today's Todoist fetcher doesn't
// carry due dates — so treating all Todoist tasks as "unscheduled" is the
// safe reading, not a placement bug. Surfacing them as a checkpoint
// placement question is T24's job.
import { BRIEF_TZ, todayInTz } from "../tz";
import { listEventsForDay, insertTentativeEvent, isGoogleCalendarConfigured } from "../../google-calendar";
import { computeTentativeBlocks, type DynamicItem } from "../tentative-blocks";
import { aggregateTrackedCentres, type Urgency } from "./tracked-centres";

const URGENCY_RANK: Record<Urgency, number> = { violation: 0, "needs-samy": 1, "next-task": 2 };

function rankedDynamicItems(): DynamicItem[] {
  return aggregateTrackedCentres()
    .slice()
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
    .map((i) => ({ centre: i.centre, title: `${i.centre}: ${i.title}` }));
}

export interface WriteResult {
  dateStr: string;
  created: { title: string; startIso: string; endIso: string; eventId: string }[];
  failed: { title: string; startIso: string; endIso: string }[];
}

/** Reads today's events, computes tentative blocks, and writes them live. */
export async function writeTentativeBlocksForToday(tz: string = BRIEF_TZ): Promise<WriteResult> {
  if (!isGoogleCalendarConfigured()) throw new Error("Google Calendar not configured");

  const { dateStr } = todayInTz(tz);
  const existing = await listEventsForDay(dateStr, tz);
  if (existing === null) throw new Error("failed to read existing calendar events");

  const blocks = computeTentativeBlocks({
    dateStr,
    tz,
    existing: existing.map((e) => ({ startIso: e.startIso, endIso: e.endIso })),
    dynamicItems: rankedDynamicItems(),
  });

  const created: WriteResult["created"] = [];
  const failed: WriteResult["failed"] = [];
  for (const b of blocks) {
    const eventId = await insertTentativeEvent(b.title, b.startIso, b.endIso);
    if (eventId) created.push({ ...b, eventId });
    else failed.push(b);
  }
  return { dateStr, created, failed };
}
