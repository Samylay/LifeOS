// Persistent per-centre backlog files for centres with no external task
// source (workouts, polymath, software-engineering-learning) — see
// ~/loop-me/workflows/daily-planning.md "Backlog files" section.
//
// Each file is a simple markdown checklist living next to the SQLite DB
// (LIFEOS_DB_PATH's directory), so the daily-planning brief can read/append
// to it without a cross-repo dependency. Items persist across days until
// marked done.
import path from "node:path";
import fs from "node:fs";

export type BacklogCentre = "workouts" | "polymath" | "swe-learning";

export interface BacklogItem {
  text: string;
  done: boolean;
}

function dataDir(): string {
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function backlogFile(centre: BacklogCentre): string {
  return path.join(dataDir(), `${centre}.md`);
}

function parseBacklog(contents: string): BacklogItem[] {
  const items: BacklogItem[] = [];
  for (const line of contents.split("\n")) {
    const match = line.match(/^-\s*\[( |x)\]\s*(.*)$/);
    if (!match) continue;
    items.push({ done: match[1] === "x", text: match[2].trim() });
  }
  return items;
}

function serializeBacklog(items: BacklogItem[]): string {
  return items.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n") + "\n";
}

export function readBacklog(centre: BacklogCentre): BacklogItem[] {
  try {
    return parseBacklog(fs.readFileSync(backlogFile(centre), "utf8"));
  } catch {
    return [];
  }
}

export function readUnfinishedBacklog(centre: BacklogCentre): BacklogItem[] {
  return readBacklog(centre).filter((item) => !item.done);
}

export function appendBacklogItem(centre: BacklogCentre, text: string): void {
  const items = readBacklog(centre);
  items.push({ text, done: false });
  fs.writeFileSync(backlogFile(centre), serializeBacklog(items));
}

export function markBacklogItemDone(centre: BacklogCentre, text: string): void {
  const items = readBacklog(centre);
  const item = items.find((it) => it.text === text && !it.done);
  if (item) item.done = true;
  fs.writeFileSync(backlogFile(centre), serializeBacklog(items));
}
