// T24 — reply transport for the daily-planning checkpoint.
// POST { text } -> parse the plain-text reply against today's live context
// (tentative calendar blocks + the cached brief's placement questions) and
// execute it: reschedule/decline patch the live calendar, place/add create
// new tentative events. Intent parsing itself lives in lib/brief/plan-reply.ts
// and knows nothing about this route — Telegram/n8n or a future voice channel
// can POST here (or call the parser) without changes to the parsing logic.
import { NextRequest, NextResponse } from "next/server";
import { BRIEF_TZ, todayInTz } from "@/lib/brief/tz";
import { parsePlanReply, type PlanReplyContext } from "@/lib/brief/plan-reply";
import { TENTATIVE_PREFIX } from "@/lib/brief/tentative-blocks";
import { briefOnDisk } from "@/lib/brief/builder";
import type { PlanningBody } from "@/lib/brief/fetchers/planning";
import {
  listEventsForDay,
  patchEventTime,
  deleteEvent,
  insertTentativeEvent,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: BRIEF_TZ,
  });
}

export async function POST(req: NextRequest) {
  let text: string;
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ ok: false, error: "empty text" }, { status: 400 });
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ ok: false, error: "calendar not configured" }, { status: 503 });
  }

  const { dateStr } = todayInTz();
  const events = await listEventsForDay(dateStr);
  if (events === null) {
    return NextResponse.json({ ok: false, error: "failed to read calendar" }, { status: 502 });
  }

  const planningCard = briefOnDisk()?.cards.find((c) => c.id === "planning");
  const cardBody = planningCard?.body as unknown as PlanningBody | undefined;

  const ctx: PlanReplyContext = {
    dateStr,
    tz: BRIEF_TZ,
    blocks: events
      .filter((e) => e.summary.startsWith(TENTATIVE_PREFIX))
      .map((e) => ({ eventId: e.id, title: e.summary, startIso: e.startIso, endIso: e.endIso })),
    placements: cardBody?.placements ?? [],
  };

  const intent = parsePlanReply(text, ctx);

  switch (intent.type) {
    case "reschedule": {
      const ok = await patchEventTime(intent.eventId, intent.startIso, intent.endIso);
      return NextResponse.json({
        ok, intent,
        summary: ok
          ? `Moved "${intent.blockTitle}" to ${fmtTime(intent.startIso)}.`
          : "Calendar update failed.",
      }, { status: ok ? 200 : 502 });
    }
    case "decline": {
      const ok = await deleteEvent(intent.eventId);
      return NextResponse.json({
        ok, intent,
        summary: ok
          ? `Dropped "${intent.blockTitle}" for today — it stays eligible tomorrow.`
          : "Calendar delete failed.",
      }, { status: ok ? 200 : 502 });
    }
    case "place": {
      const eventId = await insertTentativeEvent(
        `${TENTATIVE_PREFIX}${intent.content}`, intent.startIso, intent.endIso);
      return NextResponse.json({
        ok: Boolean(eventId), intent,
        summary: eventId
          ? `Placed "${intent.content}" at ${fmtTime(intent.startIso)}.`
          : "Calendar insert failed.",
      }, { status: eventId ? 200 : 502 });
    }
    case "add": {
      const eventId = await insertTentativeEvent(
        `${TENTATIVE_PREFIX}${intent.title}`, intent.startIso, intent.endIso);
      return NextResponse.json({
        ok: Boolean(eventId), intent,
        summary: eventId
          ? `Added "${intent.title}" at ${fmtTime(intent.startIso)}.`
          : "Calendar insert failed.",
      }, { status: eventId ? 200 : 502 });
    }
    default:
      return NextResponse.json({ ok: false, intent, summary: intent.reason }, { status: 422 });
  }
}
