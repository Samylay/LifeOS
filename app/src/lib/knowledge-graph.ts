import path from "node:path";
import { parse } from "yaml";
import type { Note } from "./kb";
import type { KnowledgeGraph, KnowledgeNode, KnowledgeEdge } from "./knowledge-graph-types";

function frontmatter(content: string): { tags: string[]; aliases: string[] } {
  const raw = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!raw) return { tags: [], aliases: [] };
  try {
    const fields = parse(raw, { maxAliasCount: 30 });
    const list = (value: unknown) => (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
      .filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    return { tags: list(fields?.tags), aliases: list(fields?.aliases) };
  } catch { return { tags: [], aliases: [] }; }
}

/** Extract authored links only. Never treat examples in code as relationships. */
export function noteLinks(content: string): string[] {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})[^\n]*$/gm, "")
    .replace(/<!--[^]*?-->/g, "").replace(/`+[^`\n]*`+/g, "");
  return [
    ...[...body.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((match) => match[1].split("|")[0]),
    ...[...body.matchAll(/(?<!!)\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^]*?["'])?\s*\)/g)].map((match) => match[1] ?? match[2]),
    ...[...body.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)].map((match) => match[1] ?? match[2]),
  ];
}

export function buildKnowledgeGraph(notes: Note[], totalNotes = notes.length): KnowledgeGraph {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const paths = new Map<string, string[]>();
  const names = new Map<string, Set<string>>();
  const addName = (name: string, id: string) => {
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, new Set());
    names.get(key)!.add(id);
  };
  const fm = new Map(notes.map((note) => [note.path, frontmatter(note.content)]));
  for (const note of notes) {
    const key = note.path.replace(/\.md$/i, "").toLowerCase();
    paths.set(key, [...(paths.get(key) ?? []), note.path]);
    for (const name of [path.posix.basename(key), note.title, ...fm.get(note.path)!.aliases]) addName(name, note.path);
    const tags = [...new Set([...(note.tags ?? []), ...fm.get(note.path)!.tags].map((tag) => tag.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
    nodes.push({ id: note.path, path: note.path, kind: "note", label: note.title, folder: note.path.includes("/") ? note.folder : "Root", summary: note.summary, tags });
  }
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, kind: KnowledgeEdge["kind"]) => {
    if (source === target) return;
    const key = JSON.stringify([source, target, kind]);
    if (!seen.has(key)) { seen.add(key); edges.push({ source, target, kind }); }
  };
  const resolve = (source: string, raw: string): string | null | undefined => {
    let target: string;
    try { target = decodeURIComponent(raw.trim()).split(/[?#]/)[0].replace(/\\/g, "/"); }
    catch { return null; }
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
    const hasOtherExtension = path.posix.extname(target) && !/\.md$/i.test(target);
    target = target.replace(/\.md$/i, "");
    const candidates = target.startsWith("/") ? [target.slice(1)] : [path.posix.join(path.posix.dirname(source), target), target];
    for (const candidate of candidates) {
      const normalized = path.posix.normalize(candidate);
      if (normalized.startsWith("../")) continue;
      const ids = paths.get(normalized.toLowerCase());
      if (ids?.length === 1) return ids[0];
    }
    if (hasOtherExtension) return null;
    if (target.includes("/")) return undefined;
    const ids = names.get(target.toLowerCase());
    return ids?.size === 1 ? [...ids][0] : undefined;
  };
  let unresolvedLinks = 0;
  for (const note of notes) for (const raw of new Set(noteLinks(note.content))) {
    const target = resolve(note.path, raw);
    if (target) addEdge(note.path, target, "link");
    else if (target === undefined) unresolvedLinks++;
  }
  const tags = new Set<string>();
  for (const node of [...nodes]) for (const tag of node.tags) {
    const id = `tag:${tag}`;
    if (!tags.has(tag)) { tags.add(tag); nodes.push({ id, kind: "tag", label: tag, folder: "Topics", tags: [] }); }
    addEdge(node.id, id, "tag");
  }
  return { nodes, edges, totalNotes, unresolvedLinks };
}
