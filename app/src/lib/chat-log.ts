// Server-side chat persistence + vault routing (T45, loss-audit F1).
//
// Every chat exchange is durably logged inside /api/chat as it is produced:
// the user message on arrival, homelab tool results as they execute, the
// assistant reply (with executed action results) before it is streamed back.
// Closing the tab can no longer lose content.
//
// Samy's ruling (2026-07-13): a FINISHED conversation counts as a session and
// goes into the vault. "Finished" = explicitly cleared from the panel
// (/api/chat/end) or idle past STALE_MS — the same abandonment sweep contract
// as teach.ts, and the same write-before-status-flip ordering so a failed
// vault write is retried on the next sweep.
import fs from "node:fs";
import path from "node:path";
import { createDoc, getDoc, listDocs, updateDoc } from "./server-db";
import { toMs } from "./teach";

const SESSIONS = "users/local/chatSessions";
const MESSAGES = "users/local/chatMessages";

// Same vault-write conventions as teach.ts / voice-inbox.ts.
const KB_PATH = process.env.KB_PATH || "/vault";
const CHAT_INBOX_DIR = "01-Inbox/chat";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

const STALE_MS = 3 * 60 * 60 * 1000;

export interface ChatSessionDoc {
  id: string;
  clientId: string;
  status: "live" | "ended" | "routed";
  abandoned?: boolean;
  vaultPath?: string;
  startedAt?: unknown;
  lastActivityAt?: unknown;
}

export interface ChatMessageDoc {
  id: string;
  clientId: string;
  idx: number;
  role: "user" | "assistant" | "tool";
  text: string;
  results?: Array<{ tool: string; summary: string; failed?: boolean }>;
  createdAt?: unknown;
}

function enc(d: Date): { __date: string } {
  return { __date: d.toISOString() };
}

function findSession(clientId: string): ChatSessionDoc | null {
  const rows = listDocs(SESSIONS, {
    where: [["clientId", "==", clientId]],
  }) as unknown as ChatSessionDoc[];
  return rows[0] ?? null;
}

/** Append one message to the session log, creating the session on first use.
 * Must never throw into the chat request path — logging failure is loud in
 * the server log but invisible to the user. */
export function logChatMessage(
  clientId: string,
  role: ChatMessageDoc["role"],
  text: string,
  results?: ChatMessageDoc["results"]
): void {
  try {
    if (!clientId) return;
    let session = findSession(clientId);
    if (!session) {
      createDoc(SESSIONS, {
        clientId,
        status: "live",
        startedAt: enc(new Date()),
        lastActivityAt: enc(new Date()),
      });
      session = findSession(clientId);
    }
    const count = (listDocs(MESSAGES, { where: [["clientId", "==", clientId]] }) as unknown[]).length;
    createDoc(MESSAGES, {
      clientId,
      idx: count,
      role,
      text: text.slice(0, 20000),
      ...(results?.length ? { results } : {}),
      createdAt: enc(new Date()),
    });
    if (session) {
      updateDoc(SESSIONS, session.id, { status: "live", lastActivityAt: enc(new Date()) });
    }
  } catch (err) {
    console.error("chat-log: failed to persist message:", err);
  }
}

/** End a conversation and route it to the vault inbox (Hermes's watched
 * intake — 01-Inbox/chat is NOT on Hermes's ignore list, unlike voice/).
 * Idempotent; vault write happens BEFORE the status flip so a failed write
 * leaves the session "ended" for the sweep to retry. Sessions with no user
 * messages are marked routed without a vault note — nothing to keep. */
export function endChatSession(clientId: string, abandoned = false): string {
  const session = findSession(clientId);
  if (!session) return "";
  if (session.status === "routed") return session.vaultPath || "";
  if (session.status === "live") {
    updateDoc(SESSIONS, session.id, { status: "ended", abandoned, endedAt: enc(new Date()) });
  }

  const messages = (listDocs(MESSAGES, {
    where: [["clientId", "==", clientId]],
    orderBy: ["idx", "asc"],
  }) as unknown as ChatMessageDoc[]);

  if (!messages.some((m) => m.role === "user")) {
    updateDoc(SESSIONS, session.id, { status: "routed", vaultPath: "" });
    return "";
  }

  const started = toMs(session.startedAt) ?? Date.now();
  const date = new Date(started).toISOString().slice(0, 10);
  const label = (m: ChatMessageDoc) =>
    m.role === "user" ? "Samy" : m.role === "assistant" ? "Assistant" : "Tool";
  const transcriptMd = messages
    .map((m) => {
      const lines = [`**${label(m)}:** ${m.text}`];
      for (const r of m.results ?? []) {
        lines.push(`- _${r.failed ? "failed" : "did"}: ${r.summary}_`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const rel = `${CHAT_INBOX_DIR}/${date}-chat-${clientId.slice(0, 6)}.md`;
  const full = path.join(KB_PATH, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const body = `# Chat session — ${date}

- session: ${clientId}
- messages: ${messages.length}${abandoned ? "\n- note: conversation was abandoned mid-flow and swept automatically (no messages lost)" : ""}

## Transcript

${transcriptMd}
`;
  fs.writeFileSync(full, body, "utf-8");
  try {
    fs.chownSync(path.dirname(full), KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // local dev — perms already fine
  }

  updateDoc(SESSIONS, session.id, { status: "routed", vaultPath: rel });
  return rel;
}

/** Sweep: route stale live conversations and retry ended-but-unrouted ones.
 * Runs alongside the teach sweep (same nightly caller). */
export function sweepStaleChatSessions(): { swept: string[]; retried: string[] } {
  const swept: string[] = [];
  const retried: string[] = [];
  const now = Date.now();
  const live = listDocs(SESSIONS, { where: [["status", "==", "live"]] }) as unknown as ChatSessionDoc[];
  for (const s of live) {
    const last = toMs(s.lastActivityAt) ?? toMs(s.startedAt) ?? 0;
    if (now - last > STALE_MS) {
      endChatSession(s.clientId, true);
      swept.push(s.clientId);
    }
  }
  const ended = listDocs(SESSIONS, { where: [["status", "==", "ended"]] }) as unknown as ChatSessionDoc[];
  for (const s of ended) {
    endChatSession(s.clientId, Boolean(s.abandoned));
    retried.push(s.clientId);
  }
  return { swept, retried };
}
