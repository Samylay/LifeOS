import type { KnowledgeGraph } from "./knowledge-graph-types";
export interface Point { x: number; y: number }

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** A deterministic, bounded force layout. A spatial grid bounds local repulsion. */
export function layoutKnowledgeGraph(graph: KnowledgeGraph): Record<string, Point> {
  const folders = [...new Set(graph.nodes.filter((n) => n.kind === "note").map((n) => n.folder))].sort();
  const points = graph.nodes.map((node) => {
    const angle = Math.max(0, folders.indexOf(node.folder)) / Math.max(1, folders.length) * Math.PI * 2;
    const seed = hash(node.id);
    const radius = node.kind === "tag" ? 100 : folders.length > 1 ? 240 : 0;
    return { id: node.id, x: 600 + Math.cos(angle) * radius + seed % 301 - 150, y: 400 + Math.sin(angle) * radius * 0.8 + (seed >>> 10) % 241 - 120, vx: 0, vy: 0 };
  });
  const indices = new Map(points.map((point, index) => [point.id, index]));
  const links = graph.edges.map((edge) => ({ a: indices.get(edge.source), b: indices.get(edge.target), kind: edge.kind }));
  for (let tick = 0; tick < (points.length > 800 ? 100 : 180); tick++) {
    const grid = new Map<string, number[]>();
    points.forEach((point, index) => {
      const key = `${Math.floor(point.x / 60)},${Math.floor(point.y / 60)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(index);
    });
    points.forEach((point, index) => {
      const cx = Math.floor(point.x / 60), cy = Math.floor(point.y / 60);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const other of grid.get(`${x},${y}`) ?? []) {
        if (other <= index) continue;
        const dx = point.x - points[other].x || 0.1, dy = point.y - points[other].y || 0.1;
        const distance = Math.max(16, dx * dx + dy * dy);
        const force = 90 / distance;
        point.vx += dx * force; point.vy += dy * force;
        points[other].vx -= dx * force; points[other].vy -= dy * force;
      }
    });
    for (const link of links) {
      if (link.a === undefined || link.b === undefined) continue;
      const a = points[link.a], b = points[link.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const force = (length - (link.kind === "tag" ? 95 : 65)) / length * (link.kind === "tag" ? 0.018 : 0.045);
      a.vx += dx * force; a.vy += dy * force; b.vx -= dx * force; b.vy -= dy * force;
    }
    for (const point of points) {
      point.vx = (point.vx + (600 - point.x) * 0.0008) * 0.65;
      point.vy = (point.vy + (400 - point.y) * 0.0008) * 0.65;
      point.x += Math.max(-10, Math.min(10, point.vx));
      point.y += Math.max(-10, Math.min(10, point.vy));
    }
  }
  if (!points.length) return {};
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(1.5, 1040 / Math.max(1, maxX - minX), 650 / Math.max(1, maxY - minY));
  return Object.fromEntries(points.map(({ id, x, y }) => [id, {
    x: 600 + (x - (minX + maxX) / 2) * scale,
    y: 400 + (y - (minY + maxY) / 2) * scale,
  }]));
}
