"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Focus, Loader2, Minus, Network, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { layoutKnowledgeGraph, type Point } from "@/lib/knowledge-graph-layout";
import type { KnowledgeGraph as Graph, KnowledgeNode } from "@/lib/knowledge-graph-types";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const EMPTY: Graph = { nodes: [], edges: [], totalNotes: 0, unresolvedLinks: 0 };
type Camera = { x: number; y: number; scale: number };
const INITIAL_CAMERA: Camera = { x: 0, y: 0, scale: 1 };

export function KnowledgeGraph({ onOpenNote }: { onOpenNote: (path: string) => Promise<void> }) {
  const [graph, setGraph] = useState<Graph>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [topics, setTopics] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string | null; start: Point; origin: Point; moved: boolean } | null>(null);
  const [movedNodes, setMovedNodes] = useState<Record<string, Point>>({});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/kb/graph", { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => {
        if (controller.signal.aborted) return;
        setGraph(data); setEnabled(data.enabled !== false); setMovedNodes({});
      })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load the graph. Your notes are still available in the list."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const folders = useMemo(() => [...new Set(graph.nodes.filter((n) => n.kind === "note").map((n) => n.folder))].sort(), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const noteIds = useMemo(() => new Set(graph.nodes.filter((n) => n.kind === "note" && (!folder || n.folder === folder)).map((n) => n.id)), [graph, folder]);
  const tagIds = useMemo(() => new Set(topics ? graph.edges.filter((e) => e.kind === "tag" && noteIds.has(e.source)).map((e) => e.target) : []), [graph, topics, noteIds]);
  const visibleGraph = useMemo(() => {
    const nodes = graph.nodes.filter((n) => noteIds.has(n.id) || tagIds.has(n.id));
    const ids = new Set(nodes.map((n) => n.id));
    return { ...graph, nodes, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [graph, noteIds, tagIds]);
  const basePositions = useMemo(() => layoutKnowledgeGraph(visibleGraph), [visibleGraph]);
  const positions = useMemo(() => ({ ...basePositions, ...movedNodes }), [basePositions, movedNodes]);
  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of visibleGraph.edges) { counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1); counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1); }
    return counts;
  }, [visibleGraph]);
  const { nodes, edges } = visibleGraph;
  const visibleIds = new Set(nodes.map((n) => n.id));
  const active = selected && visibleIds.has(selected) ? byId.get(selected) : undefined;
  const neighbours = new Set(edges.filter((edge) => edge.source === active?.id || edge.target === active?.id).flatMap((edge) => [edge.source, edge.target]));
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = nodes.filter((node) => words.every((word) => `${node.label} ${node.path ?? ""} ${node.tags.join(" ")}`.toLowerCase().includes(word)));
  const matchedIds = new Set(matches.map((n) => n.id));
  const prominent = new Set([...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, 12).map((n) => n.id));
  const color = (node: KnowledgeNode) => node.kind === "tag" ? "var(--muted-foreground)" : COLORS[Math.max(0, folders.indexOf(node.folder)) % COLORS.length];
  const pointAt = (x: number, y: number): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const zoom = useCallback((factor: number, anchor: Point = { x: 600, y: 400 }) => {
    setCamera((current) => {
      const scale = Math.max(0.35, Math.min(6, current.scale * factor));
      const ratio = scale / current.scale;
      return { scale, x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio };
    });
  }, []);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(Math.exp(-event.deltaY * 0.0015), pointAt(event.clientX, event.clientY)); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, loading, error]);
  const focusNode = (id: string) => {
    setSelected(id);
    const point = positions[id];
    if (point) setCamera({ scale: 2, x: 600 - point.x * 2, y: 400 - point.y * 2 });
  };
  const reset = () => { setCamera(INITIAL_CAMERA); setSelected(null); setMovedNodes({}); };

  if (loading) return <Card className="min-h-96 items-center justify-center p-8"><Loader2 className="animate-spin text-primary" size={22} /><p className="text-sm text-muted-foreground">Mapping your notes and their connections…</p></Card>;
  if (error) return <Card className="p-6" role="alert"><p className="text-sm">{error}</p><Button variant="outline" onClick={() => setRevision((r) => r + 1)}>Retry</Button></Card>;
  if (!enabled || !graph.nodes.length) return <Card className="p-6"><Network size={24} className="text-primary" /><h2 className="font-medium">Your knowledge map starts with a note</h2><p className="text-sm text-muted-foreground">{enabled ? "Save notes and link them to one another. Their connections will appear here." : "Connect your knowledge base to explore its graph."}</p></Card>;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3"><Search size={15} className="text-muted-foreground" /><input className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" aria-label="Find a graph node" placeholder="Find a note or topic…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <Button variant="ghost" size="icon" aria-label="Clear graph search" onClick={() => setQuery("")}><X size={14} /></Button>}</label>
      <select aria-label="Filter graph by folder" value={folder} onChange={(e) => { setFolder(e.target.value); reset(); }} className="min-h-11 max-w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">All folders</option>{folders.map((f) => <option key={f} value={f}>{f}</option>)}</select>
      <Button variant={topics ? "secondary" : "outline"} aria-pressed={topics} onClick={() => { setTopics((t) => !t); reset(); }}>Topics</Button>
      <Button variant="outline" size="icon" aria-label="Refresh graph" onClick={() => setRevision((r) => r + 1)}><RefreshCw size={15} /></Button>
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="relative min-w-0 bg-background">
        <div className="pointer-events-none absolute left-4 top-4 z-10 text-xs text-muted-foreground"><span className="font-mono text-foreground">{noteIds.size}</span> notes · <span className="font-mono text-foreground">{edges.filter((e) => e.kind === "link").length}</span> note links{topics && <> · {tagIds.size} topics</>}</div>
        <svg ref={svg} viewBox="0 0 1200 800" className="h-[55vh] min-h-[380px] max-h-[700px] w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:h-[650px]" role="group" aria-label="Knowledge graph. Drag the background to pan, scroll to zoom, or use the controls. Select a node to see its connections." tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const delta = 50;
            if (event.key === "+" || event.key === "=") zoom(1.25);
            else if (event.key === "-") zoom(0.8);
            else if (event.key === "0") reset();
            else if (event.key === "Escape") setSelected(null);
            else if (event.key.startsWith("Arrow")) setCamera((c) => ({ ...c, x: c.x + (event.key === "ArrowLeft" ? delta : event.key === "ArrowRight" ? -delta : 0), y: c.y + (event.key === "ArrowUp" ? delta : event.key === "ArrowDown" ? -delta : 0) }));
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            const id = (event.target as Element).closest("[data-node]")?.getAttribute("data-node") ?? null;
            const start = pointAt(event.clientX, event.clientY);
            drag.current = { id, start, origin: id ? positions[id] : { x: camera.x, y: camera.y }, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.isPrimary) return;
            const current = drag.current;
            if (!current) return;
            const point = pointAt(event.clientX, event.clientY);
            const dx = point.x - current.start.x, dy = point.y - current.start.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) current.moved = true;
            if (current.id) setMovedNodes((nodes) => ({ ...nodes, [current.id!]: { x: current.origin.x + dx / cameraRef.current.scale, y: current.origin.y + dy / cameraRef.current.scale } }));
            else setCamera((c) => ({ ...c, x: current.origin.x + dx, y: current.origin.y + dy }));
          }}
          onPointerUp={(event) => { const current = drag.current; if (current && !current.moved) setSelected(current.id); drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current = null; }}>
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            {edges.map((edge) => { const a = positions[edge.source], b = positions[edge.target]; const highlighted = active && (edge.source === active.id || edge.target === active.id); return <line key={`${edge.kind}:${edge.source}:${edge.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={highlighted ? "var(--primary)" : "var(--muted-foreground)"} strokeWidth={highlighted ? 1.8 : 0.8} strokeDasharray={edge.kind === "tag" ? "3 5" : undefined} opacity={highlighted ? 0.85 : active ? 0.07 : edge.kind === "tag" ? 0.16 : 0.3} pointerEvents="none" />; })}
            {nodes.map((node) => {
              const p = positions[node.id];
              const isActive = node.id === active?.id;
              const lit = active ? isActive || neighbours.has(node.id) : words.length ? matchedIds.has(node.id) : true;
              const radius = node.kind === "tag" ? 4 : Math.min(12, 5 + Math.log2(1 + (degree.get(node.id) ?? 0)));
              const label = isActive || (active && neighbours.has(node.id)) || (words.length && matchedIds.has(node.id)) || camera.scale > 1.8 || prominent.has(node.id);
              return <g key={node.id} transform={`translate(${p.x} ${p.y})`} opacity={lit ? 1 : 0.18}>
                <g data-node={node.id} role="button" tabIndex={0} aria-label={`${node.label}, ${node.kind === "tag" ? "topic" : "note"}, ${degree.get(node.id) ?? 0} connections`} aria-pressed={isActive} className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-foreground [&:focus-visible>circle]:stroke-[3]" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setSelected(node.id); } }}>
                  <circle r={Math.max(radius, 14)} fill="transparent" />
                  {isActive && <circle r={radius + 6} fill="none" stroke={color(node)} strokeWidth={1.5} />}
                  <circle r={radius} fill={color(node)} stroke={isActive ? "var(--foreground)" : "var(--background)"} strokeWidth={1.5} className="pressable active:scale-[0.97]" />
                  <title>{node.label}</title>
                </g>
                {label && <text x={radius + 6} y={4} fontSize={isActive ? 13 : 11} fill={isActive ? "var(--foreground)" : "var(--muted-foreground)"} paintOrder="stroke" stroke="var(--background)" strokeWidth={3} strokeLinejoin="round" pointerEvents="none">{node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label}</text>}
              </g>;
            })}
          </g>
        </svg>
        {nodes.length === 0 && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No nodes in this view. Choose another folder.</p>}
        <div className="absolute bottom-3 left-3 flex gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm"><Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoom(1.3)}><Plus size={15} /></Button><Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoom(1 / 1.3)}><Minus size={15} /></Button><Button variant="ghost" size="icon" aria-label="Reset graph view" onClick={reset}><Focus size={15} /></Button></div>
        <p className="pointer-events-none absolute bottom-4 right-4 hidden text-[11px] text-muted-foreground sm:block">Drag to explore · Scroll to zoom</p>
      </div>
      <aside className="max-h-[650px] space-y-5 overflow-y-auto border-t border-border p-4 lg:border-l lg:border-t-0" aria-label="Graph details">
        {active ? <>
          <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{active.kind === "tag" ? "Topic" : active.folder}</p><h2 className="mt-1 break-words text-base font-semibold">{active.label}</h2></div><Button variant="ghost" size="icon" aria-label="Clear selected node" onClick={() => setSelected(null)}><X size={14} /></Button></div>
          {active.summary && <p className="text-sm leading-relaxed text-muted-foreground">{active.summary}</p>}
          {active.path && <Button disabled={opening} onClick={async () => { setOpening(true); try { await onOpenNote(active.path!); } finally { setOpening(false); } }}>{opening ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}Open note</Button>}
          <div><h3 className="mb-2 text-xs font-medium text-muted-foreground">{active.kind === "tag" ? "Notes with this topic" : "Connected notes & topics"}</h3>{neighbours.size <= 1 ? <p className="text-sm text-muted-foreground">No connections in this view.</p> : [...neighbours].filter((id) => id !== active.id).map((id) => <button key={id} onClick={() => focusNode(id)} className="mb-1 block min-h-9 w-full rounded-md px-2 py-1.5 text-left text-sm pressable hover:bg-muted active:scale-[0.97]">{byId.get(id)?.kind === "tag" ? "# " : ""}{byId.get(id)?.label}</button>)}</div>
        </> : <><Network size={22} className="text-primary" /><div><h2 className="text-sm font-medium">Follow a connection</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Select a node to see what it connects to. Larger nodes have more connections.</p></div><div className="space-y-2 text-xs text-muted-foreground"><p>━ Linked in a note</p><p>┄ Shared topic membership</p></div><div className="flex flex-wrap gap-x-3 gap-y-2">{folders.map((f, i) => <button key={f} onClick={() => setFolder(folder === f ? "" : f)} aria-pressed={folder === f} className="inline-flex min-h-8 items-center gap-1.5 text-xs pressable active:scale-[0.97]"><span className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{f}</button>)}</div></>}
        <div className="space-y-2 border-t border-border pt-4"><label htmlFor="graph-node-picker" className="text-xs font-medium text-muted-foreground">Jump to a note or topic</label><select id="graph-node-picker" value={active?.id ?? ""} onChange={(e) => { if (e.target.value) focusNode(e.target.value); }} className="min-h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"><option value="">Choose a node…</option>{matches.map((node) => <option key={node.id} value={node.id}>{node.kind === "tag" ? "# " : ""}{node.label}</option>)}</select></div>
        {words.length > 0 && <div><p className="mb-2 text-xs text-muted-foreground" role="status">{matches.length} matching nodes</p>{matches.slice(0, 30).map((node) => <button key={node.id} onClick={() => focusNode(node.id)} className="block min-h-9 w-full rounded-md p-2 text-left text-sm pressable hover:bg-muted active:scale-[0.97]">{node.label}</button>)}</div>}
      </aside>
    </div>
    <p className="text-xs text-muted-foreground">Connections come from wiki links, Markdown links, and saved tags. {graph.unresolvedLinks > 0 && `${graph.unresolvedLinks} missing or ambiguous link targets are not drawn. `}{graph.totalNotes > graph.nodes.filter((n) => n.kind === "note").length && `Showing the first 2,000 of ${graph.totalNotes} notes.`}</p>
  </div>;
}
