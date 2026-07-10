// T36 — server-side execution of triage verdicts, shared by the reply route
// (/api/triage/reply) and the voice inbox (a "triage" voice note). Parsing is
// in triage-reply.ts (pure); this module does the I/O: file to vault / idea
// bank / backlog, or discard, and flip the item's status. Kept transport-free
// so any channel (text reply, voice, a future Telegram thread) reuses it.
import fs from "node:fs";
import path from "node:path";
import { listDocs, updateDoc, createDoc } from "@/lib/server-db";
import { appendBacklogItem, type BacklogCentre } from "@/lib/backlog";
import { parseTriageReply, type TriageAction } from "./triage-reply";

const COLLECTION = "users/local/triageQueue";
const KB_PATH = process.env.KB_PATH || "/vault";
const TRIAGE_DIR = "05-Knowledge/Inbox-Triage";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

interface QProposal {
  summary?: string; why_relevant?: string; destination?: string; rationale?: string;
}

function fileToVault(url: string, source: string, p: QProposal): void {
  const date = new Date().toISOString().slice(0, 10);
  const full = path.join(KB_PATH, `${TRIAGE_DIR}/${date}.md`);
  const dir = path.dirname(full);
  const isNew = !fs.existsSync(full);
  fs.mkdirSync(dir, { recursive: true });
  const header = isNew ? `# Triage — ${date}\n` : "";
  const entry = `${header}\n## ${source}: ${url}\n${p.summary ?? ""}\n${p.why_relevant ? `\n**Why:** ${p.why_relevant}\n` : ""}`;
  fs.appendFileSync(full, entry, "utf-8");
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
    pillar: "", hookFormula: "", episode: "",
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

export function applyTriageReply(text: string): TriageApplyResult {
  const proposed = listDocs(COLLECTION, {
    where: [["status", "==", "proposed"]],
    orderBy: ["createdAt", "asc"],
  });
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
    const p = (item.proposal ?? {}) as QProposal;
    const url = String(item.url ?? "");
    const source = String(item.source ?? "other");

    // "approve" honors the proposed destination; explicit verbs override it.
    let action = v.action;
    if (action === "approve") {
      const dest = p.destination ?? "discard";
      if (dest === "vault") action = "vault";
      else if (dest === "idea-bank") action = "idea-bank";
      else if (dest.startsWith("backlog")) action = "backlog";
      else if (dest === "discard") action = "discard";
      else action = "vault"; // roadmap:* etc. → park in the vault note for now
    }

    try {
      if (action === "vault") fileToVault(url, source, p);
      else if (action === "idea-bank") fileToIdeaBank(url, p);
      else if (action === "backlog") {
        const centre = (v.centre ?? "polymath") as BacklogCentre;
        appendBacklogItem(centre, `${p.summary ?? url} — ${url}`);
      }
      const status = action === "discard" ? "discarded" : "filed";
      updateDoc(COLLECTION, item.id, { status, filedAs: action, filedAt: { __date: new Date().toISOString() } });
      results.push(`${v.n} ${ACTION_LABEL[action]}`);
    } catch (e) {
      results.push(`${v.n}: failed (${e instanceof Error ? e.message : "error"})`);
    }
  }

  return { ok: true, count: verdicts.length, summary: results.join(" · ") };
}
