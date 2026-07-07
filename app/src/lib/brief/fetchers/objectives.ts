// Objectives — rotating continuity prompts across life-domain fields.
//
// Reads objectives.yaml (field definitions) + state.json (rotation heartbeat)
// from OBJECTIVES_DIR (host ~/services/objectives, mounted at /objectives),
// picks 2 fields/day (oldest last_shown first, weight breaks ties), and emits
// one "prompt" card per field. Answers land in 01-Inbox/voice/{date}.md via
// /api/voice tagged "objective:<field>"; classify.py (host service) routes
// them into that field's log.md on its next sweep — routing is NOT this
// fetcher's job, this only decides which 2 questions to ask today.

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { card, type FetchResult } from "../registry";
import { todayInTz } from "../tz";

const OBJECTIVES_DIR = process.env.OBJECTIVES_DIR || "/objectives";
const VAULT_PATH = process.env.OBJECTIVES_VAULT || process.env.KB_PATH || "/vault";
const FIELDS_PER_DAY = 2;

interface Field {
  label: string;
  weight: number;
  prompt_strategy: "continuity" | "rotate";
  log: string; // vault-relative
  prompt_pool: string[];
}

interface RotationState {
  last_shown: Record<string, string | null>;
}

function loadState(statePath: string): RotationState {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as RotationState;
  } catch {
    return { last_shown: {} };
  }
}

function writeState(statePath: string, state: RotationState) {
  const tmp = path.join(path.dirname(statePath), `.state.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath);
}

function pickFields(fields: Record<string, Field>, lastShown: Record<string, string | null>): string[] {
  return Object.keys(fields)
    .sort((a, b) => {
      // Never-shown fields (null) sort before any date string.
      const da = lastShown[a] ?? "";
      const db = lastShown[b] ?? "";
      if (da !== db) return da < db ? -1 : 1;
      const w = fields[b].weight - fields[a].weight;
      return w !== 0 ? w : a.localeCompare(b);
    })
    .slice(0, FIELDS_PER_DAY);
}

/** Last non-empty, non-header line of a field's log.md, or null. */
function lastLogEntry(logRelPath: string): string | null {
  let lines: string[];
  try {
    lines = fs.readFileSync(path.join(VAULT_PATH, logRelPath), "utf8").split("\n");
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const s = lines[i].trim();
    if (!s || s.startsWith("#") || s.startsWith(">")) continue;
    return s;
  }
  return null;
}

function buildPrompt(field: Field, dayOfYear: number): string {
  if (field.prompt_strategy === "continuity") {
    const last = lastLogEntry(field.log);
    if (last) return `Last time on ${field.label}: "${last.slice(0, 200)}" — what's the update?`;
  }
  return field.prompt_pool[dayOfYear % field.prompt_pool.length];
}

export async function fetch(): Promise<FetchResult> {
  const configPath = path.join(OBJECTIVES_DIR, "objectives.yaml");
  const statePath = path.join(OBJECTIVES_DIR, "state.json");

  const fields = (parse(fs.readFileSync(configPath, "utf8")) as { fields: Record<string, Field> }).fields;
  const state = loadState(statePath);
  state.last_shown ??= {};
  for (const key of Object.keys(fields)) state.last_shown[key] ??= null;

  const today = todayInTz();
  const picked = pickFields(fields, state.last_shown);

  const cards = picked.map((key) => {
    const field = fields[key];
    const promptText = buildPrompt(field, today.dayOfYear);
    state.last_shown[key] = today.dateStr;
    return card({
      id: `objective_${key}`, type: "prompt", priority: "action", status: "neutral",
      title: `Objective — ${field.label}`,
      body: {
        prompt_text: promptText,
        category: `objective:${key}`,
        inbox_note: `01-Inbox/voice/${today.dateStr}.md`,
      },
    });
  });

  writeState(statePath, state);
  return cards;
}
