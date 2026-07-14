// T36 — server-side execution of triage verdicts, shared by the reply route
// (/api/triage/reply) and the voice inbox (a "triage" voice note). Parsing is
// in triage-reply.ts (pure); this module does the I/O: file to vault / idea
// bank / backlog, or discard, and flip the item's status. Kept transport-free
// so any channel (text reply, voice, a future Telegram thread) reuses it.
import fs from "node:fs";
import path from "node:path";
import { listDocs, updateDoc, createDoc } from "@/lib/server-db";
import { appendBacklogItem, type BacklogCentre } from "@/lib/backlog";
import { mergeFrontmatterTags } from "@/lib/frontmatter";
import { parseTriageReply, normalizeCentre, type TriageAction } from "./triage-reply";

const COLLECTION = "users/local/triageQueue";
const KB_PATH = process.env.KB_PATH || "/vault";
const TRIAGE_DIR = "05-Knowledge/Inbox-Triage";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

interface QProposal {
  summary?: string; why_relevant?: string; destination?: string; rationale?: string;
  tags?: string[];
}

/**
 * Append one item to today's triage note, merging its tags into the note's
 * frontmatter.
 *
 * We tag here rather than letting Hermes do it (it is scoped off this folder as
 * of 2026-07-14) for two reasons. Hermes was re-summarising what study.py had
 * already written; and because it skips any note containing a `## Hermes`
 * block, only the FIRST item filed on a given day ever got tagged — items 2..n
 * were silently untagged forever. study.py has already read the content and
 * already paid for the Opus call, so tags are nearly free at file time, and
 * every item's tags land on the note instead of just the first one's.
 *
 * Read-modify-write rather than append, since frontmatter lives at the top.
 * Written atomically: a crash mid-write must not truncate a vault note.
 */
function fileToVault(url: string, source: string, p: QProposal): void {
  const date = new Date().toISOString().slice(0, 10);
  const full = path.join(KB_PATH, `${TRIAGE_DIR}/${date}.md`);
  const dir = path.dirname(full);
  fs.mkdirSync(dir, { recursive: true });

  const prev = fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
  const header = prev ? "" : `# Triage — ${date}\n`;
  const entry = `${header}\n## ${source}: ${url}\n${p.summary ?? ""}\n${p.why_relevant ? `\n**Why:** ${p.why_relevant}\n` : ""}`;
  const next = mergeFrontmatterTags(prev + entry, p.tags);

  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, next, "utf-8");
  fs.renameSync(tmp, full);
  try {
    fs.chownSync(dir, KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // local dev, not root — perms already fine
  }
}

function fileToIdeaBank(url: string, p: QProposal): void {
  createDoc("users/local/contentIdeas", {
    title: (p.summary ?? url).slice(0, 120),
    pillar: "", // unsorted — assigned during review; hookFormula/episode omitted (numbers, unset)
    status: "idea",
    content: `${p.why_relevant ?? ""}\n\nSource: ${url}`.trim(),
    createdAt: { __date: new Date().toISOString() },
    updatedAt: { __date: new Date().toISOString() },
  });
}

const ACTION_LABEL: Record<TriageAction, string> = {
  approve: "filed", vault: "→ vault", "idea-bank": "→ idea bank",
  backlog: "→ backlog", discard: "discarded",
};

export interface TriageApplyResult {
  ok: boolean;
  summary: string;
  count: number;
}

// Apply one action to one already-loaded queue item — the unit the numbered
// reply loop below and the /decide swipe/voice routes share. "approve" honors
// the proposed destination; explicit verbs override it. Throws on I/O failure.
export function applyActionToItem(
  item: Record<string, unknown>,
  rawAction: TriageAction,
  rawCentre?: string | null
): string {
  const p = (item.proposal ?? {}) as QProposal;
  const url = String(item.url ?? "");
  const source = String(item.source ?? "other");

  let action = rawAction;
  let centre = rawCentre ?? null;
  if (action === "approve") {
    const dest = p.destination ?? "discard";
    if (dest === "vault") action = "vault";
    else if (dest === "idea-bank") action = "idea-bank";
    else if (dest.startsWith("backlog")) {
      action = "backlog";
      centre = centre ?? normalizeCentre(dest.replace(/^backlog:?\s*/i, "").trim());
    } else if (dest === "discard") action = "discard";
    else action = "vault"; // roadmap:* etc. → park in the vault note for now
  }

  if (action === "vault") fileToVault(url, source, p);
  else if (action === "idea-bank") fileToIdeaBank(url, p);
  else if (action === "backlog") {
    appendBacklogItem((centre ?? "polymath") as BacklogCentre, `${p.summary ?? url} — ${url}`);
  }
  const status = action === "discard" ? "discarded" : "filed";
  updateDoc(COLLECTION, String(item.id), {
    status,
    filedAs: action,
    filedAt: { __date: new Date().toISOString() },
  });
  return ACTION_LABEL[action];
}

// Voice/text may carry the source as a leading word ("ig 1 approve", "x 2
// skip") when the caller can't pass it out-of-band (the card reply box passes
// it explicitly; a spoken verdict can't).
function detectSource(text: string): { source?: string; rest: string } {
  const m = text.match(/^\s*(x|twitter|tweets?|ig|insta(?:gram)?|reels?|links?|other)\b[\s:,-]*/i);
  if (!m) return { rest: text };
  const w = m[1].toLowerCase();
  const source = /^(x|twitter|tweet)/.test(w) ? "x"
    : /^(ig|insta|reel)/.test(w) ? "instagram"
    : /^(link|other)/.test(w) ? "other" : undefined;
  return { source, rest: text.slice(m[0].length) };
}

export function applyTriageReply(text: string, source?: string): TriageApplyResult {
  // Numbers on the Triage card are per-source (the card is split by source),
  // so resolve verdicts against the same source-filtered, createdAt-asc list.
  let effectiveSource = source;
  let body = text;
  if (!effectiveSource) {
    const d = detectSource(text);
    effectiveSource = d.source;
    body = d.rest;
  }
  const where: [string, "==", unknown][] = [["status", "==", "proposed"]];
  if (effectiveSource) where.push(["source", "==", effectiveSource]);
  const proposed = listDocs(COLLECTION, { where, orderBy: ["createdAt", "asc"] });
  text = body;
  const verdicts = parseTriageReply(text);
  if (verdicts.length === 0) {
    return { ok: false, count: 0, summary: 'Couldn\'t read a verdict. Try: "1 approve, 2 to vault, 3 skip".' };
  }

  const results: string[] = [];
  for (const v of verdicts) {
    const item = proposed[v.n - 1];
    if (!item) {
      results.push(`${v.n}: no such item`);
      continue;
    }
    try {
      const label = applyActionToItem(item, v.action, v.centre ?? null);
      results.push(`${v.n} ${label}`);
    } catch (e) {
      results.push(`${v.n}: failed (${e instanceof Error ? e.message : "error"})`);
    }
  }

  return { ok: true, count: verdicts.length, summary: results.join(" · ") };
}
