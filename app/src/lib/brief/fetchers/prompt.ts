// Morning prompt — the one bidirectional card.
//
// Rotates deterministically through prompts.json by day-of-year (in BRIEF_TZ)
// so both surfaces (cards page, Telegram) show the same prompt for a given
// date. Transcripts land in a dated inbox note via /api/voice; routing /
// classification is a later project.

import prompts from "../prompts.json";
import { card, type FetchResult } from "../registry";
import { todayInTz } from "../tz";

const INBOX_DIR = "01-Inbox/voice"; // vault-relative

export async function fetch(): Promise<FetchResult> {
  const pool = prompts.prompts;
  if (!pool.length) throw new Error("prompts.json has no prompts");

  const today = todayInTz();
  const p = pool[today.dayOfYear % pool.length];

  return card({
    id: "prompt", type: "prompt", priority: "action", status: "neutral",
    title: "Morning prompt",
    body: {
      prompt_text: p.text,
      category: p.category,
      inbox_note: `${INBOX_DIR}/${today.dateStr}.md`,
    },
  });
}
