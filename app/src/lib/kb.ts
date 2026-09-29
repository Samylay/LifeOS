// Server-side read access for notes used by the Decide extracts view.
import fs from "node:fs";
import path from "node:path";

const KB_PATH = process.env.KB_PATH || "";
const HERMES_HEADER = "## Hermes";

export function kbEnabled(): boolean {
  return Boolean(KB_PATH) && fs.existsSync(KB_PATH);
}

export interface NoteMeta {
  path: string;
  title: string;
  folder: string;
  mtime: number;
  summary?: string;
  tags?: string[];
}

export interface Note extends NoteMeta {
  content: string;
}

function safeResolve(relPath: string): string {
  const full = path.resolve(KB_PATH, relPath);
  const root = path.resolve(KB_PATH);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("path escapes vault");
  }
  return full;
}

function parseHermes(content: string): { summary?: string; tags?: string[] } {
  const idx = content.indexOf(HERMES_HEADER);
  if (idx === -1) return {};
  const section = content.slice(idx + HERMES_HEADER.length);
  const summary = section.match(/Summary:\s*(.+)/i)?.[1]?.trim();
  const tagsLine = section.match(/Tags:\s*(.+)/i)?.[1]?.trim();
  const tags = tagsLine
    ? tagsLine.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)
    : undefined;
  return { summary, tags };
}

function deriveTitle(content: string, file: string): string {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const title = frontmatter[1].match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (title) return title;
  }
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(file, ".md");
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
