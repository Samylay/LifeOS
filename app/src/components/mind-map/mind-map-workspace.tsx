"use client";

import { useRef, useState } from "react";
import { BookOpen, Network, Shapes, X } from "lucide-react";
import { KnowledgeBrowser } from "./knowledge-browser";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { SystemMap } from "./system-map";
import { WorkflowConnections } from "./workflow-connections";
import { MindMapView } from "@/components/mind-map/mind-map-view";
import { FlowSelector } from "@/components/workspace/visual-navigation";
import { useKnowledge, type Note } from "@/lib/use-kb";
import { Button } from "@/components/ui/button";

export function MindMapWorkspace() {
  const request = useRef(0);
  const [knowledgeView, setKnowledgeView] = useState("browse");
  const [view, setView] = useState("knowledge");
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const { readNote } = useKnowledge();
  const KnowledgeView = knowledgeView === "browse" ? KnowledgeBrowser : KnowledgeGraph;
  return <div className="space-y-5">
    <FlowSelector label="Map content" value={view} onChange={(id) => { request.current++; setOpening(false); setView(id); setNote(null); setError(""); }} options={[
      { id: "knowledge", label: "Your knowledge", icon: BookOpen },
      { id: "connections", label: "Source paths", icon: Network },
      { id: "workspace", label: "LifeOS system", icon: Network },
      { id: "example", label: "Example map", icon: Shapes },
    ]} />
    {view === "knowledge" && <>
      <FlowSelector label="Knowledge view" value={knowledgeView} onChange={setKnowledgeView} options={[{ id: "browse", label: "Browse notes", icon: BookOpen }, { id: "graph", label: "Graph", icon: Network }]} />
      <KnowledgeView onOpenNote={async (path) => {
        const revision = ++request.current;
        setNote(null); setOpening(true); setError("");
        try {
          const next = await readNote(path);
          if (revision !== request.current) return;
          if (next) setNote(next); else setError("Could not open that note. Try selecting it again.");
        } catch { if (revision === request.current) setError("Could not open that note. Try selecting it again."); }
        finally { if (revision === request.current) setOpening(false); }
      }} />
      {opening && <p role="status" className="text-sm text-muted-foreground">Opening note…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {note && <section aria-label={`Note: ${note.title}`} className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-medium">{note.title}</h2><p className="mt-1 text-xs text-muted-foreground">{note.path}</p></div><Button variant="ghost" size="icon" aria-label="Close note" onClick={() => setNote(null)}><X size={16} /></Button></div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{note.content}</pre>
      </section>}
    </>}
    {view === "connections" && <WorkflowConnections />}
    {view === "workspace" && <SystemMap />}
    {view === "example" && <MindMapView />}
  </div>;
}
