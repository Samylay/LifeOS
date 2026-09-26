"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { KnowledgeGraph } from "@/lib/knowledge-graph-types";

export function KnowledgeBrowser({ onOpenNote }: { onOpenNote: (path: string) => Promise<void> }) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [error, setError] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/api/kb/graph", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) { setGraph(data); setEnabled(data.enabled !== false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision]);
  const notes = useMemo(() => graph?.nodes.filter((node) => node.kind === "note") ?? [], [graph]);
  const folders = [...new Set(notes.map((note) => note.folder))].sort();
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = notes.filter((note) => (!folder || note.folder === folder) && words.every((word) => `${note.label} ${note.summary ?? ""} ${note.tags.join(" ")}`.toLowerCase().includes(word)));
  const active = notes.find((note) => note.id === selected);
  const links = active ? graph?.edges.filter((edge) => edge.kind === "link" && (edge.source === active.id || edge.target === active.id)) ?? [] : [];
  const linkedIds = new Set(links.map((edge) => edge.source === active?.id ? edge.target : edge.source));
  const linked = notes.filter((note) => linkedIds.has(note.id));
  return <section className="space-y-4" aria-label="Knowledge browser">
    <div><h2 className="text-xl font-semibold">Find a note. Follow its connections.</h2><p className="mt-1 text-sm text-muted-foreground">Browse titles and summaries, then explore the notes linked to each one.</p></div>
    {error ? <div role="alert" className="flex items-center gap-3 text-sm">Could not load your notes.<Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div> : !graph ? <p role="status">Loading notes…</p> : !enabled ? <p>The knowledge base is not configured.</p> : <>
      <div className="flex flex-wrap gap-3"><label className="min-w-0 flex-1"><span className="sr-only">Search notes</span><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(60); }} placeholder="Search titles, summaries, and tags" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base" /></label><label><span className="sr-only">Folder</span><select value={folder} onChange={(event) => { setFolder(event.target.value); setLimit(60); }} className="h-11 max-w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">All folders</option>{folders.map((name) => <option key={name}>{name}</option>)}</select></label></div>
      <p className="text-sm text-muted-foreground" role="status">{matches.length} notes{graph.totalNotes > notes.length ? ` · ${notes.length} of ${graph.totalNotes} available in this view` : ""}</p>
      <div className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
        <div className="max-h-[65dvh] overflow-y-auto p-2">{matches.length === 0 && <p className="p-5 text-muted-foreground">{notes.length ? "No matching notes. Try another search or folder." : "No notes found in your knowledge base."}</p>}{matches.slice(0, limit).map((note) => <button key={note.id} aria-pressed={selected === note.id} onClick={() => setSelected(note.id)} className="block w-full rounded-lg p-4 text-left pressable active:scale-[0.97] hover:bg-muted aria-pressed:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"><span className="block text-xs text-muted-foreground">{note.folder}</span><span className="mt-1 block break-words text-lg font-medium">{note.label}</span>{note.summary && <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{note.summary}</span>}</button>)}{matches.length > limit && <Button variant="outline" className="m-3" onClick={() => setLimit((value) => value + 60)}>Show more notes</Button>}</div>
        <aside className="space-y-4 border-t border-border p-5 lg:max-h-[65dvh] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Note connections">{active ? <><p className="text-xs text-muted-foreground">{active.folder}</p><h3 className="break-words text-xl font-semibold">{active.label}</h3>{active.summary && <p className="text-base leading-relaxed text-muted-foreground">{active.summary}</p>}{active.path && <Button disabled={opening} onClick={async () => { setOpening(true); try { await onOpenNote(active.path!); } finally { setOpening(false); } }}>{opening ? "Opening…" : "Read note"}</Button>}<div className="flex flex-wrap gap-2">{active.tags.map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs">{tag}</span>)}</div><h4 className="border-t border-border pt-4 text-sm font-medium">Linked notes · {linked.length}</h4>{linked.length ? linked.map((note) => <button key={note.id} onClick={() => setSelected(note.id)} className="block w-full break-words rounded-lg p-2 text-left text-base pressable active:scale-[0.97] hover:bg-muted">{note.label}</button>) : <p className="text-sm text-muted-foreground">No direct links to other notes yet.</p>}</> : <><h3 className="text-lg font-medium">Choose a note</h3><p className="text-sm leading-relaxed text-muted-foreground">Its summary and linked notes appear here. Connections come from links in your notes.</p></>}</aside>
      </div>
      {graph.unresolvedLinks > 0 && <p className="text-xs text-muted-foreground">{graph.unresolvedLinks} missing or ambiguous link targets are not shown.</p>}
    </>}
  </section>;
}
