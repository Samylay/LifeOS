import fs from "fs";
import path from "path";

export interface VaultNote {
  /** Relative path from vault root, e.g. "03-Projects/JECT.md" */
  path: string;
  /** Filename without extension */
  title: string;
  /** Vault folder, e.g. "03-Projects" */
  folder: string;
  /** Raw markdown content */
  content: string;
  /** Extracted [[wiki-links]] */
  links: string[];
  /** Extracted #tags */
  tags: string[];
  /** Extracted checkbox items */
  todos: { text: string; done: boolean }[];
  /** Section headings with their content */
  sections: { heading: string; level: number; content: string }[];
}

export interface VaultSearchResult {
  note: VaultNote;
  /** Matched lines with surrounding context */
  matches: string[];
  score: number;
}

/** Resolve the vault root directory. Defaults to parent of process.cwd() (app/) */
function getVaultRoot(): string {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  return path.resolve(process.cwd(), "..");
}

/** Recursively find all .md files under a directory */
function findMarkdownFiles(dir: string, base: string = dir): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "app") {
        continue;
      }
      if (entry.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath, base));
      } else if (entry.name.endsWith(".md")) {
        files.push(path.relative(base, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files;
}

/** Extract [[wiki-links]] from markdown content */
function extractLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/** Extract #tags from markdown content */
function extractTags(content: string): string[] {
  const matches = content.match(/(?:^|\s)#([a-zA-Z][\w-]*)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim().slice(1)))];
}

/** Extract checkbox items */
function extractTodos(content: string): { text: string; done: boolean }[] {
  const todos: { text: string; done: boolean }[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)/);
    if (match) {
      todos.push({ text: match[2].trim(), done: match[1] !== " " });
    }
  }
  return todos;
}

/** Parse markdown into sections by heading */
function extractSections(content: string): { heading: string; level: number; content: string }[] {
  const lines = content.split("\n");
  const sections: { heading: string; level: number; content: string; startLine: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      sections.push({
        heading: match[2].trim(),
        level: match[1].length,
        content: "",
        startLine: i,
      });
    }
  }

  // Fill section content
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startLine + 1;
    const end = i < sections.length - 1 ? sections[i + 1].startLine : lines.length;
    sections[i].content = lines
      .slice(start, end)
      .join("\n")
      .trim();
  }

  return sections.map(({ heading, level, content }) => ({ heading, level, content }));
}

/** Parse a single markdown file into a VaultNote */
export function parseNote(relativePath: string, content: string): VaultNote {
  const folder = path.dirname(relativePath);
  const title = path.basename(relativePath, ".md");

  return {
    path: relativePath,
    title,
    folder: folder === "." ? "" : folder,
    content,
    links: extractLinks(content),
    tags: extractTags(content),
    todos: extractTodos(content),
    sections: extractSections(content),
  };
}

/** Read and parse all vault notes */
export function readVault(): VaultNote[] {
  const root = getVaultRoot();
  const files = findMarkdownFiles(root);
  const notes: VaultNote[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(root, file), "utf-8");
      notes.push(parseNote(file, content));
    } catch {
      // Skip unreadable files
    }
  }

  return notes;
}

/** Read a specific vault note by relative path */
export function readNote(relativePath: string): VaultNote | null {
  const root = getVaultRoot();
  const fullPath = path.join(root, relativePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return parseNote(relativePath, content);
  } catch {
    return null;
  }
}

/** Search vault notes by query string (case-insensitive full-text search) */
export function searchVault(query: string): VaultSearchResult[] {
  const notes = readVault();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: VaultSearchResult[] = [];

  for (const note of notes) {
    const lowerContent = note.content.toLowerCase();
    const lowerTitle = note.title.toLowerCase();

    // Score based on term matches
    let score = 0;
    const matchedLines: string[] = [];

    for (const term of terms) {
      // Title match is worth more
      if (lowerTitle.includes(term)) score += 10;

      // Content matches
      const lines = note.content.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(term)) {
          score += 1;
          if (matchedLines.length < 5) {
            matchedLines.push(line.trim());
          }
        }
      }
    }

    if (score > 0) {
      results.push({ note, matches: matchedLines, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/** Build a compact life context string from the vault for the AI system prompt */
export function buildLifeContext(): string {
  const root = getVaultRoot();
  const sections: string[] = [];

  // Helper to safely read a file
  const read = (relativePath: string): string | null => {
    try {
      return fs.readFileSync(path.join(root, relativePath), "utf-8");
    } catch {
      return null;
    }
  };

  // --- Identity & Profile ---
  const career = read("05-Areas/Career.md");
  if (career) {
    sections.push(`## Who You Are\n${career}`);
  }

  // --- Current Goals ---
  const goals = read("04-Goals/Goals-2026.md");
  if (goals) {
    sections.push(`## Your Goals\n${goals}`);
  }

  // --- Quarterly Quests ---
  const quests = read("04-Goals/Quarterly-Quests.md");
  if (quests) {
    sections.push(`## Quarterly Quests\n${quests}`);
  }

  // --- Health & Training ---
  const health = read("05-Areas/Health.md");
  if (health) {
    sections.push(`## Health & Training\n${health}`);
  }

  // --- Inbox (urgent items) ---
  const inbox = read("01-Inbox.md");
  if (inbox) {
    // Extract just the urgent section
    const urgentMatch = inbox.match(/## Urgent[^\n]*\n([\s\S]*?)(?=\n##|\n$)/);
    if (urgentMatch) {
      sections.push(`## Inbox (Urgent)\n${urgentMatch[1].trim()}`);
    }
  }

  // --- Active Projects ---
  const projectFiles = [
    "03-Projects/JECT.md",
    "03-Projects/Personal-Brand.md",
    "03-Projects/Tech-Setup.md",
  ];

  const projectSummaries: string[] = [];
  for (const pf of projectFiles) {
    const content = read(pf);
    if (content) {
      // Extract first few lines as summary
      const lines = content.split("\n").filter((l) => l.trim());
      const title = lines[0]?.replace(/^#+\s*/, "") || pf;
      const statusLine = lines.find((l) => l.toLowerCase().includes("status:"));
      const todoItems = content
        .split("\n")
        .filter((l) => l.match(/^[-*]\s+\[ \]/))
        .slice(0, 5)
        .map((l) => l.trim());
      projectSummaries.push(
        `### ${title}\n${statusLine || ""}\nKey TODOs:\n${todoItems.join("\n")}`
      );
    }
  }
  if (projectSummaries.length > 0) {
    sections.push(`## Active Projects\n${projectSummaries.join("\n\n")}`);
  }

  // --- Other Areas ---
  const areaFiles = [
    "05-Areas/Finance.md",
    "05-Areas/Learning.md",
    "05-Areas/Creativity.md",
    "05-Areas/Life-Admin.md",
    "05-Areas/Relationships.md",
  ];

  for (const af of areaFiles) {
    const content = read(af);
    if (content) {
      const title = content.split("\n")[0]?.replace(/^#+\s*/, "") || af;
      const todoItems = content
        .split("\n")
        .filter((l) => l.match(/^[-*]\s+\[ \]/))
        .slice(0, 3);
      if (todoItems.length > 0) {
        sections.push(`### ${title}\n${todoItems.join("\n")}`);
      }
    }
  }

  return sections.join("\n\n---\n\n");
}
