export interface KnowledgeNode {
  id: string;
  kind: "note" | "tag";
  label: string;
  folder: string;
  path?: string;
  summary?: string;
  tags: string[];
}
export interface KnowledgeEdge { source: string; target: string; kind: "link" | "tag" }
export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  totalNotes: number;
  unresolvedLinks: number;
}
