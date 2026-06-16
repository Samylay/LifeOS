// Server-side only — read/search/write access to the Obsidian knowledge base
// that Hermes manages (mounted at KB_PATH, default /vault).
//
// LifeOS is the cockpit: it browses and searches the notes Hermes enriches,
// and can capture new notes back into the vault — Hermes then appends its
// `## Hermes` summary/tags on the next file-watch pass.
import fs from "node:fs";
import path from "node:path";

const KB_PATH = process.env.KB_PATH || "";
// Container runs as root but the vault is owned by the host user; chown
// notes we create so Hermes (running as that user) can enrich them.
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

const IGNORE_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);
const HERMES_HEADER = "## Hermes";

export function kbEnabled(): boolean {
  return Boolean(KB_PATH) && fs.existsSync(KB_PATH);
}

export interface NoteMeta {
  path: string; // vault-relative, e.g. "01-Inbox/idea.md"
  title: string;
  folder: string; // top-level folder, e.g. "01-Inbox"
  mtime: number;
  summary?: string;
  tags?: string[];
}

export interface Note extends NoteMeta {
  content: string;
}

// --- Path safety -------------------------------------------------------------

/** Resolve a vault-relative path, refusing anything that escapes KB_PATH. */
function safeResolve(relPath: string): string {
  const full = path.resolve(KB_PATH, relPath);
  const root = path.resolve(KB_PATH);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("path escapes vault");
  }
  return full;
}

// --- Parsing -----------------------------------------------------------------

function parseHermes(content: string): { summary?: string; tags?: string[] } {
  const idx = content.indexOf(HERMES_HEADER);
  if (idx === -1) return {};
  const section = content.slice(idx + HERMES_HEADER.length);
  const summary = section.match(/Summary:\s*(.+)/i)?.[1]?.trim();
  const tagsLine = section.match(/Tags:\s*(.+)/i)?.[1]?.trim();
  const tags = tagsLine
    ? tagsLine.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
    : undefined;
  return { summary, tags };
}

function deriveTitle(content: string, file: string): string {
  // Frontmatter `title:`
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (t) return t;
  }
  // First H1
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1;
  // Filename without extension
  return path.basename(file, ".md");
}

// --- Listing / search --------------------------------------------------------

function walk(dir: string, acc: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.endsWith(".md")) acc.push(full);
  }
}

/**
 * List notes, newest first. When `q` is given, filter by case-insensitive
 * match against the title, path, or file contents.
 */
export function listNotes(q?: string, limit = 200): NoteMeta[] {
  if (!kbEnabled()) return [];
  const root = path.resolve(KB_PATH);
  const files: string[] = [];
  walk(root, files);

  const query = q?.trim().toLowerCase();
  const out: NoteMeta[] = [];
  for (const file of files) {
    let content: string;
    let mtime: number;
    try {
      content = fs.readFileSync(file, "utf-8");
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    if (query) {
      const hay = (rel + "\n" + content).toLowerCase();
      if (!hay.includes(query)) continue;
    }
    const { summary, tags } = parseHermes(content);
    out.push({
      path: rel,
      title: deriveTitle(content, file),
      folder: rel.split(path.sep)[0] || "",
      mtime,
      summary,
      tags,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

export function readNote(relPath: string): Note | null {
  if (!kbEnabled()) return null;
  const full = safeResolve(relPath);
  let content: string;
  let mtime: number;
  try {
    content = fs.readFileSync(full, "utf-8");
    mtime = fs.statSync(full).mtimeMs;
  } catch {
    return null;
  }
  const { summary, tags } = parseHermes(content);
  return {
    path: relPath,
    title: deriveTitle(content, full),
    folder: relPath.split(path.sep)[0] || "",
    mtime,
    summary,
    tags,
    content,
  };
}

// --- Write-back --------------------------------------------------------------

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

/**
 * Create a new note in the vault (default folder 01-Inbox). Only ever creates
 * new files — never edits existing notes — so Hermes' enrichment is never
 * clobbered. Returns the vault-relative path written.
 */
export function createNote(opts: {
  title: string;
  content?: string;
  folder?: string;
}): string {
  if (!kbEnabled()) throw new Error("knowledge base not configured");
  const folder = (opts.folder || "01-Inbox").replace(/^\/+|\/+$/g, "");
  const dir = safeResolve(folder);
  fs.mkdirSync(dir, { recursive: true });

  let slug = slugify(opts.title);
  let filename = `${slug}.md`;
  // Avoid collisions rather than overwriting.
  if (fs.existsSync(path.join(dir, filename))) {
    slug = `${slug}-${Date.now().toString(36)}`;
    filename = `${slug}.md`;
  }
  const full = path.join(dir, filename);

  const created = new Date().toISOString().split("T")[0];
  const body = [
    "---",
    `title: ${opts.title}`,
    `created: ${created}`,
    "source: lifeos",
    "---",
    "",
    `# ${opts.title}`,
    "",
    (opts.content || "").trim(),
    "",
  ].join("\n");

  fs.writeFileSync(full, body, "utf-8");
  // Hand ownership to the host user so Hermes can append its section.
  try {
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // Not running as root / unsupported — best-effort, note still created.
  }
  return path.relative(path.resolve(KB_PATH), full);
}
