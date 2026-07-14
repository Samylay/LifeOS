// Merging tags into an Obsidian note's YAML frontmatter.
//
// Obsidian indexes ONLY frontmatter `tags:` or inline `#tags` — bold prose like
// `**Tags:** a, b` is invisible to the tag pane, `tag:#x` search and Dataview.
// Hermes emitted prose for months and every tag it wrote was inert (audit
// 2026-07-14). The vault's real convention is flow-style `tags: [a, b]`, so
// that is what we write here too.
//
// This is the TypeScript twin of merge_frontmatter_tags() in
// ~/services/hermes/hermes.py. Two copies in two languages is not ideal, but a
// shared implementation would mean a network hop or a rewrite of one side —
// the contract is small and pinned by tests on both. If you change the tag
// FORMAT, change both.

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const TAGS_FLOW_RE = /^tags:[ \t]*\[.*?\][ \t]*$/m;
const TAGS_BLOCK_RE = /^tags:[ \t]*\n(?:[ \t]*-[ \t]*.+\n?)+/m;

/** "Claude Code", "#ai" -> ["claude-code", "ai"]. Order-preserving, deduped. */
export function normalizeTags(raw: string[] | string | undefined): string[] {
  const parts = typeof raw === "string" ? raw.split(/[,\n]/) : (raw ?? []);
  const out: string[] = [];
  for (const t of parts) {
    const clean = String(t)
      .trim()
      .replace(/^#+/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9/_-]/g, "")
      .replace(/^-+|-+$/g, "");
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function existingTags(fm: string): string[] {
  const flow = fm.match(TAGS_FLOW_RE);
  if (flow) {
    const inner = flow[0].slice(flow[0].indexOf("[") + 1, flow[0].lastIndexOf("]"));
    return normalizeTags(inner);
  }
  const block = fm.match(TAGS_BLOCK_RE);
  if (block) {
    return normalizeTags([...block[0].matchAll(/-[ \t]*(.+)/g)].map((m) => m[1]));
  }
  return [];
}

/**
 * Union `newTags` into the note's frontmatter `tags:`, non-destructively.
 *
 * Existing tags come first and are never dropped — we only ever add. Handles
 * all four shapes: no frontmatter, frontmatter without tags, flow tags, block
 * tags. Nothing new to add returns the input unchanged, so callers can write
 * unconditionally without churning the file.
 */
export function mergeFrontmatterTags(content: string, newTags: string[] | string | undefined): string {
  const tags = normalizeTags(newTags);
  if (tags.length === 0) return content;

  const m = content.match(FRONTMATTER_RE);
  if (!m) {
    return `---\ntags: [${tags.join(", ")}]\n---\n\n${content.replace(/^\n+/, "")}`;
  }

  let fm = m[1];
  const rest = content.slice(m[0].length);
  const existing = existingTags(fm);
  const merged = [...existing, ...tags.filter((t) => !existing.includes(t))];
  if (merged.length === existing.length) return content;
  const line = `tags: [${merged.join(", ")}]`;

  if (TAGS_FLOW_RE.test(fm)) fm = fm.replace(TAGS_FLOW_RE, line);
  else if (TAGS_BLOCK_RE.test(fm)) fm = fm.replace(TAGS_BLOCK_RE, `${line}\n`).replace(/\n+$/, "");
  else fm = `${fm.replace(/\n+$/, "")}\n${line}`;

  return `---\n${fm}\n---\n${rest}`;
}
