import { describe, it, expect } from "vitest";
import { parsePlanReply, parseTimeOfDay, type PlanReplyContext } from "./plan-reply";
import { localTimeToUtcIso } from "./tz";

const TZ = "Asia/Tokyo";
const DATE = "2026-07-10";
const iso = (h: number, m = 0) => localTimeToUtcIso(DATE, h, m, TZ);

const ctx: PlanReplyContext = {
  dateStr: DATE,
  tz: TZ,
  blocks: [
    { eventId: "ev-workout", title: "〜 Workout", startIso: iso(6), endIso: iso(7) },
    { eventId: "ev-poly", title: "〜 polymath", startIso: iso(7), endIso: iso(7, 30) },
    { eventId: "ev-scout", title: "〜 Scout: fix scoring", startIso: iso(9), endIso: iso(9, 30) },
  ],
  placements: [
    { id: "td-1", content: "Renew passport" },
    { id: "td-2", content: "Reply to accountant email" },
  ],
};

describe("parseTimeOfDay", () => {
  it("reads 12h, 24h and h-notation times", () => {
    expect(parseTimeOfDay("6pm")).toEqual({ hour: 18, minute: 0 });
    expect(parseTimeOfDay("6:30pm")).toEqual({ hour: 18, minute: 30 });
    expect(parseTimeOfDay("18:00")).toEqual({ hour: 18, minute: 0 });
    expect(parseTimeOfDay("18h30")).toEqual({ hour: 18, minute: 30 });
    expect(parseTimeOfDay("12am")).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeOfDay("25:00")).toBeNull();
  });
});

describe("parsePlanReply intents", () => {
  it("reschedule: moves a matched block, preserving its duration", () => {
    const intent = parsePlanReply("push the workout to 6pm", ctx);
    expect(intent).toEqual({
      type: "reschedule",
      eventId: "ev-workout",
      blockTitle: "〜 Workout",
      startIso: iso(18),
      endIso: new Date(Date.parse(iso(18)) + 60 * 60_000).toISOString(), // 60-min block
    });
  });

  it("decline: drops a matched block for today", () => {
    expect(parsePlanReply("skip polymath today", ctx)).toEqual({
      type: "decline", eventId: "ev-poly", blockTitle: "〜 polymath",
    });
    expect(parsePlanReply("won't do the scout block today", ctx)).toMatchObject({
      type: "decline", eventId: "ev-scout",
    });
  });

  it("place: answers a Todoist placement question with a 30-min block", () => {
    const intent = parsePlanReply("schedule renew passport at 4pm", ctx);
    expect(intent).toEqual({
      type: "place",
      todoistId: "td-1",
      content: "Renew passport",
      startIso: iso(16),
      endIso: iso(16, 30),
    });
  });

  it("place falls back to reschedule when the subject is a block, not a placement", () => {
    expect(parsePlanReply("schedule workout at 5pm", ctx)).toMatchObject({
      type: "reschedule", eventId: "ev-workout", startIso: iso(17),
    });
  });

  it("add: free-form addition with explicit time and optional duration", () => {
    expect(parsePlanReply("add call with mum at 8pm", ctx)).toEqual({
      type: "add", title: "call with mum", startIso: iso(20), endIso: iso(20, 30),
    });
    expect(parsePlanReply("add deep work for 90m at 10:00", ctx)).toEqual({
      type: "add", title: "deep work", startIso: iso(10), endIso: iso(11, 30),
    });
  });

  it("unknown: unmatched block, unreadable time, and gibberish all explain themselves", () => {
    expect(parsePlanReply("push the sauna to 6pm", ctx).type).toBe("unknown");
    expect(parsePlanReply("push workout to sometime", ctx).type).toBe("unknown");
    const gibberish = parsePlanReply("what even is this", ctx);
    expect(gibberish.type).toBe("unknown");
    if (gibberish.type === "unknown") expect(gibberish.reason).toContain("push");
  });
});
