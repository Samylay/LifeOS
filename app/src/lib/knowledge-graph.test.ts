import { describe, expect, it } from "vitest";
import { buildKnowledgeGraph } from "./knowledge-graph";
import { layoutKnowledgeGraph } from "./knowledge-graph-layout";
import type { Note } from "./kb";

const note = (path: string, content = "", title = path.split("/").pop()!.replace(/\.md$/, "")): Note => ({ path, title, content, mtime: 0, folder: path.split("/")[0] });

describe("knowledge graph relationships", () => {
  it("resolves wiki aliases, headings and relative Markdown links to existing notes", () => {
    const graph = buildKnowledgeGraph([
      note("a/source.md", "[[Target#Section|Read this]] [Other](../b/Other%20Note.md#part) [[Alternative]] [[Target]]"),
      note("a/Target.md"), note("b/Other Note.md", "---\naliases: [Alternative]\n---\n"),
    ]);
    expect(graph.edges).toEqual([
      { source: "a/source.md", target: "a/Target.md", kind: "link" },
      { source: "a/source.md", target: "b/Other Note.md", kind: "link" },
    ]);
    expect(graph.unresolvedLinks).toBe(0);
  });
  it("does not guess ambiguous links or invent links from code, images or external URLs", () => {
    const graph = buildKnowledgeGraph([
      note("source.md", '[[Duplicate]] [[Missing]] [[source]] `[[inline]]`\n```md\n[[code]]\n```\n[web](https://example.com) ![image](picture.png) [[photo.png]] <!-- [[hidden]] -->'),
      note("a/Duplicate.md"), note("b/Duplicate.md"),
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.unresolvedLinks).toBe(2);
    expect(graph.nodes).toHaveLength(3);
  });
  it("represents tags as explicit topic nodes, distinct from authored note links", () => {
    const graph = buildKnowledgeGraph([
      { ...note("a.md", '---\ntags: ["#React", ux]\n---\n[[b]]'), tags: ["react"] },
      note("b.md", "---\ntags:\n  - react\n---\n"), note("isolated.md"),
    ]);
    expect(graph.nodes.filter((node) => node.kind === "tag").map((node) => node.id)).toEqual(["tag:react", "tag:ux"]);
    expect(graph.edges.filter((edge) => edge.kind === "tag")).toHaveLength(3);
    expect(graph.edges.filter((edge) => edge.kind === "link")).toEqual([{ source: "a.md", target: "b.md", kind: "link" }]);
    expect(graph.nodes.some((node) => node.id === "isolated.md")).toBe(true);
  });
  it("ignores malformed frontmatter and never resolves escaped paths", () => {
    const graph = buildKnowledgeGraph([note("a.md", "---\ntags: [broken\n---\n[[../../private]] [[javascript:alert(1)]]"), note("private.md")]);
    expect(graph.edges).toEqual([]);
  });
  it("produces stable, finite layout coordinates including isolated notes", () => {
    const graph = buildKnowledgeGraph([note("a.md", "[[b]]"), note("b.md"), note("isolated.md")]);
    const layout = layoutKnowledgeGraph(graph);
    expect(layoutKnowledgeGraph(graph)).toEqual(layout);
    expect(Object.keys(layout)).toHaveLength(3);
    for (const point of Object.values(layout)) { expect(Number.isFinite(point.x)).toBe(true); expect(Number.isFinite(point.y)).toBe(true); }
    expect(layoutKnowledgeGraph({ nodes: [], edges: [], unresolvedLinks: 0, totalNotes: 0 })).toEqual({});
  });
});
