// Morning-brief builder — in-app successor to the retired ~/services/brief
// host aggregator (see docs/morning-brief-takeover.md).
//
// Builds the brief ONCE as structured JSON, then fans out to two surfaces:
//   1. BRIEF_OUT (/data/brief.json) → served by GET /api/brief-json → /brief cards.
//   2. Markdown render → POSTed to the n8n webhook that forwards to Telegram.
// One source of truth, two renders. Adding a card = one fetcher module +
// one REGISTRY entry (+ a card type in the renderer if it needs bespoke display).

import fs from "node:fs";
import path from "node:path";
import type { Brief, BriefCard } from "@/lib/brief-types";
import { REGISTRY, card } from "./registry";
import { BRIEF_TZ, todayInTz } from "./tz";

export const BRIEF_OUT = process.env.BRIEF_OUT || "/data/brief.json";
const N8N_WEBHOOK_URL = process.env.BRIEF_N8N_WEBHOOK || "";

const STATUS_EMOJI: Record<string, string> = { green: "🟢", amber: "🟠", red: "🔴", neutral: "▫️" };
const FUITE_EMOJI: Record<string, string> = { green: "🟢", orange: "🟠", red: "🔴" };

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

/** Telegram render of the brief. Same data as the cards page. */
export function renderMarkdown(brief: Brief): string {
  const lines = [`*Morning brief — ${brief.date}*`];
  const order: Record<string, number> = { action: 0, state: 1 };
  const sev: Record<string, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
  const cards = [...brief.cards].sort(
    (a, b) =>
      (order[a.priority] ?? 1) - (order[b.priority] ?? 1) ||
      (sev[a.status] ?? 2) - (sev[b.status] ?? 2)
  );

  for (const c of cards) {
    const body = c.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (c.error) {
      lines.push(`\n⚠️ *${c.title}* — unavailable`);
      continue;
    }
    if (c.type === "workout") {
      if (body.rest) {
        lines.push("\n🏋️ *Rest day* — recover well.");
      } else {
        lines.push(`\n🏋️ *${c.title}*`);
        for (const ex of body.exercises ?? []) lines.push(`  • ${ex.name} ${ex.sets}×${ex.reps}`);
      }
    } else if (c.type === "work") {
      const tasks = body.tasks ?? [];
      lines.push(`\n✅ *Today's work* (${tasks.length})`);
      for (const t of tasks) lines.push(`  • ${t.content}`);
    } else if (c.type === "prompt") {
      lines.push(`\n🎙 *Prompt:* ${body.prompt_text ?? ""}`);
    } else if (c.type === "homelab") {
      lines.push(`\n${STATUS_EMOJI[c.status] ?? "▫️"} *Homelab:* ${body.summary ?? ""}`);
      for (const issue of body.issues ?? []) lines.push(`  • ${issue}`);
    } else if (c.type === "fuite") {
      const entries = body.entries ?? [];
      if (entries.length) {
        lines.push("\n💧 *Fuite du jour*");
        for (const e of entries) {
          const types = (e.data_types ?? []).join(", ");
          lines.push(`  ${FUITE_EMOJI[e.status] ?? "⚪"} ${e.org}` + (types ? ` — ${types}` : ""));
        }
      }
    } else if (c.type === "ft_headlines") {
      const heads = body.headlines ?? [];
      if (heads.length) {
        lines.push("\n📰 *FT*");
        for (const h of heads) lines.push(`  • ${h.text}`);
      }
    } else if (c.type === "quorky_digest" && c.link) {
      lines.push(`\n🗞 [Quorky Digest](${c.link})`);
    }
  }
  return lines.join("\n");
}

async function sendTelegram(brief: Brief) {
  if (!N8N_WEBHOOK_URL) {
    log("BRIEF_N8N_WEBHOOK not set — skipping Telegram send");
    return;
  }
  const text = renderMarkdown(brief);
  const r = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`webhook ${r.status}`);
  log(`telegram send ok (${text.length} chars)`);
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
  telegramOk?: boolean;
  brief?: Brief;
}

/**
 * Build + write + send. Without `force`, skips if today's (BRIEF_TZ) brief was
 * already generated — so the boot-time catch-up never double-sends Telegram.
 */
export async function runBrief(opts: { force?: boolean; skipTelegram?: boolean } = {}): Promise<RunResult> {
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

  let telegramOk = true;
  if (!opts.skipTelegram) {
    try {
      await sendTelegram(brief);
    } catch (e) {
      // brief.json is still updated — the cards page is fine — but surface the
      // degraded run in the logs instead of hiding it behind a silent success.
      telegramOk = false;
      log(`telegram send failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { ran: true, telegramOk, brief };
}
