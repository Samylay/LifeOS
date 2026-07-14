// Ships → vault daily digest (the Hermes handoff).
//
// Once a day (05:00 BRIEF_TZ — after the 04:00 news run, before the 06:00
// brief) the previous local day's ship-log entries are written as one note,
// `01-Inbox/ships/YYYY-MM-DD.md`, in the mounted vault. Hermes watches the
// vault and enriches every new note (summary + suggested tags), so ships flow
// into the knowledge base with zero Hermes changes. Ship tags aggregate into
// the note's frontmatter as the routing key.
//
// Write-once by design: an existing note is never touched (Hermes enriches
// each note exactly once, and its `## Hermes` section must not be clobbered).
// Only the previous day is considered — the sweep is a daily digest, not a
// backfill.
import fs from "fs";
import path from "path";
import { listDocs } from "@/lib/server-db";
import { BRIEF_TZ } from "@/lib/brief/tz";

const KB_PATH = process.env.KB_PATH || "/vault";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;
const SHIPS_DIR = "01-Inbox/ships";
const SHIP_LOG_COLLECTION = "users/local/shipLog";

interface RawShip {
  what?: string;
  toWhom?: string;
  tags?: string[];
  date?: unknown;
}

export interface ShipForNote {
  what: string;
  toWhom: string;
  tags: string[];
}

/** Unwrap the doc store's {__date: iso} marker (or a plain string/Date). */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  if (v && typeof v === "object" && "__date" in v) return new Date(String((v as { __date: unknown }).__date));
  return null;
}

/** "YYYY-MM-DD" for `date` as observed in BRIEF_TZ. */
export function ymdInBriefTz(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRIEF_TZ }).format(date);
}

/** The previous local day, YYYY-MM-DD. */
export function previousDay(now: Date = new Date()): string {
  return ymdInBriefTz(new Date(now.getTime() - 86_400_000));
}

/** Render the daily digest note. Pure — unit-tested. */
export function formatShipsNote(day: string, ships: ShipForNote[]): string {
  const allTags = [...new Set(ships.flatMap((s) => s.tags))].sort();
  const lines = ships.map((s) => {
    const tags = s.tags.map((t) => `#${t}`).join(" ");
    return `- **${s.what}** → ${s.toWhom}${tags ? ` ${tags}` : ""}`;
  });
  return `---
date: ${day}
type: ship-digest
tags: [${allTags.join(", ")}]
source: lifeos-ship-log
---

# Ships — ${day}

${lines.join("\n")}
`;
}

export interface SyncResult {
  day: string;
  written: boolean;
  count: number;
  path?: string;
  reason?: string;
}

/** Write the digest note for `day` (default: yesterday). Idempotent. */
export function syncShipsToVault(day: string = previousDay()): SyncResult {
  const rel = `${SHIPS_DIR}/${day}.md`;
  const full = path.join(KB_PATH, rel);
  if (fs.existsSync(full)) return { day, written: false, count: 0, path: rel, reason: "note already exists" };

  const ships: ShipForNote[] = (listDocs(SHIP_LOG_COLLECTION) as unknown as RawShip[])
    .map((e) => ({ e, d: toDate(e.date) }))
    .filter((x): x is { e: RawShip; d: Date } => x.d !== null && ymdInBriefTz(x.d) === day)
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .map(({ e }) => ({
      what: e.what || "(untitled ship)",
      toWhom: e.toWhom || "(unrecorded)",
      tags: Array.isArray(e.tags) ? e.tags : [],
    }));
  if (ships.length === 0) return { day, written: false, count: 0, reason: "no ships that day" };

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, formatShipsNote(day, ships), "utf-8");
  try {
    // Container runs as root; the vault belongs to the host user Hermes runs
    // as (same convention as voicepal/teach vault writes).
    fs.chownSync(path.dirname(full), KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // local dev — perms already fine
  }
  return { day, written: true, count: ships.length, path: rel };
}
