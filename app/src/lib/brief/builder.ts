// Morning-brief builder — in-app successor to the retired ~/services/brief
// host aggregator (see docs/morning-brief-takeover.md).
//
// Builds the brief ONCE as structured JSON, served by GET /api/brief-json →
// /brief cards. The Telegram send (n8n webhook) was dropped 2026-07-09: the
// in-app cards page is the delivery surface now.
// Adding a card = one fetcher module + one REGISTRY entry (+ a card type in
// the renderer if it needs bespoke display).

import fs from "node:fs";
import path from "node:path";
import type { Brief, BriefCard } from "@/lib/brief-types";
import { REGISTRY, card } from "./registry";
import { BRIEF_TZ, todayInTz } from "./tz";

export const BRIEF_OUT = process.env.BRIEF_OUT || "/data/brief.json";

function log(msg: string) {
  console.log(`[brief] ${new Date().toISOString()} ${msg}`);
}

export async function buildBrief(): Promise<Brief> {
  const cards: BriefCard[] = [];
  for (const { fetch, meta } of REGISTRY) {
    try {
      const result = await fetch();
      if (result === null) continue; // fetcher opted out (e.g. no digest today)
      for (const c of Array.isArray(result) ? result : [result]) {
        cards.push(c);
        log(`card ${c.id.padEnd(14)} ok (${c.status})`);
      }
    } catch (e) {
      // Independent failure: never abort the brief.
      const msg = e instanceof Error ? e.message : String(e);
      log(`card ${meta.id.padEnd(14)} FAILED: ${msg}`);
      cards.push(card({ ...meta, status: "neutral", body: {}, error: msg }));
    }
  }
  return {
    date: todayInTz().dateStr,
    generated_at: new Date().toISOString().slice(0, 19) + "Z",
    cards,
  };
}

export function writeBriefJson(brief: Brief, outPath: string = BRIEF_OUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Atomic write so readers never see a half-written file.
  const tmp = path.join(path.dirname(outPath), `.brief.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(brief, null, 2));
  fs.renameSync(tmp, outPath);
  log(`wrote ${outPath} (${brief.cards.length} cards)`);
}

export function briefOnDisk(outPath: string = BRIEF_OUT): Brief | null {
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8")) as Brief;
  } catch {
    return null;
  }
}

export interface RunResult {
  ran: boolean;
  reason?: string;
  brief?: Brief;
}

/**
 * Build + write. Without `force`, skips if today's (BRIEF_TZ) brief was
 * already generated.
 */
export async function runBrief(opts: { force?: boolean } = {}): Promise<RunResult> {
  const today = todayInTz().dateStr;
  if (!opts.force) {
    const existing = briefOnDisk();
    if (existing?.date === today) {
      return { ran: false, reason: `brief for ${today} already generated`, brief: existing };
    }
  }

  log(`building brief for ${today} (${BRIEF_TZ})`);
  const brief = await buildBrief();
  writeBriefJson(brief);

  return { ran: true, brief };
}
