import fs from "node:fs";
import path from "node:path";

// Shared by /api/voice (transcribe) and /api/voice/save (append after
// optional human edit) — one append implementation, one place to fix perms.
const KB_PATH = process.env.KB_PATH || "/vault";
const INBOX_DIR = "01-Inbox/voice";
// Vault is owned by the host user; container runs as root (same pattern as kb.ts).
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

export function appendToInbox(date: string, prompt: string, category: string, transcript: string): string {
  const rel = `${INBOX_DIR}/${date}.md`;
  const full = path.join(KB_PATH, rel);
  const dir = path.dirname(full);
  const isNew = !fs.existsSync(full);
  fs.mkdirSync(dir, { recursive: true });

  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const header = isNew ? `# Voice inbox — ${date}\n` : "";
  // Quote every prompt line — talk-session prompts are a multi-line topic
  // list, and unquoted lines would be swept up as transcript by classify.py.
  const quoted = prompt.split("\n").map((l) => `> ${l}`).join("\n");
  const entry = `${header}\n## ${time} · ${category}\n${quoted}\n\n${transcript}\n`;
  fs.appendFileSync(full, entry, "utf-8");
  try {
    fs.chownSync(dir, KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // Not running as root (local dev) — vault perms already fine.
  }
  return rel;
}
