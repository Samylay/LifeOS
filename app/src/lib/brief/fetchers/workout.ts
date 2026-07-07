// Today's session from the weekly plan note in the Obsidian vault.
//
// Source of truth is a fenced ```yaml block in the note. Expected shape:
//   week:
//     mon:
//       label: Full body A
//       exercises: [{name: Squat, sets: 4, reps: 6-8}]
//     tue: rest
// Days absent from the mapping count as rest days. "Today" is BRIEF_TZ, not
// server time. App-owned editing of the plan is still phase 2.

import fs from "node:fs";
import { parse } from "yaml";
import { card, type FetchResult } from "../registry";
import { todayInTz, weekdayLabelInTz } from "../tz";

const PLAN_NOTE = process.env.WORKOUT_PLAN_NOTE || "/vault/04-Areas/Health/workout-plan.md";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

interface Session {
  label?: string;
  exercises?: { name?: string; sets?: number; reps?: string | number }[];
}

export async function fetch(): Promise<FetchResult> {
  const text = fs.readFileSync(PLAN_NOTE, "utf8");
  const m = text.match(/```ya?ml\n([\s\S]*?)```/);
  if (!m) throw new Error(`no \`\`\`yaml block found in ${PLAN_NOTE}`);
  const plan = (parse(m[1]) || {}) as { week?: Record<string, Session | "rest"> };

  const week = plan.week || {};
  const session = week[DAY_KEYS[todayInTz().weekdayIndex]];

  if (!session || session === "rest") {
    return card({
      id: "workout", type: "workout", priority: "action", status: "neutral",
      title: "Rest day", body: { rest: true, exercises: [] },
    });
  }

  const label = session.label || "Session";
  const exercises = (session.exercises || []).map((e) => ({
    name: e.name || "?",
    sets: e.sets || 0,
    reps: String(e.reps ?? ""),
  }));
  return card({
    id: "workout", type: "workout", priority: "action", status: "neutral",
    title: label,
    body: { rest: false, day_label: `${weekdayLabelInTz()} — ${label}`, exercises },
  });
}
