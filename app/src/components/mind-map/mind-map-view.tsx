"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import { ArrowUpRight, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MIND_MAP_EDGES,
  MIND_MAP_GROUPS,
  MIND_MAP_NODES,
  type MindMapEdge,
  type MindMapGroup,
  type MindMapNode,
} from "@/lib/mind-map-data";

const GROUP_COLORS: Record<MindMapGroup, string> = {
  focus: "var(--primary)",
  school: "var(--chart-4)",
  apps: "var(--chart-3)",
  lifeos: "var(--chart-2)",
  ai: "var(--chart-5)",
  growth: "var(--destructive)",
};

function edgePath(edge: MindMapEdge, byId: Map<string, MindMapNode>) {
  const source = byId.get(edge.source);
  const target = byId.get(edge.target);
  if (!source || !target) return null;
  const bend = (target.x - source.x) * 0.42;
  return {
    d: `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`,
    color: GROUP_COLORS[source.group === "focus" ? target.group : source.group],
    related: edge.kind === "related",
  };
}

function NodeButton({ node, open, onOpenChange }: {
  node: MindMapNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const color = GROUP_COLORS[node.group];
  const relatedIds = [...new Set(MIND_MAP_EDGES
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => edge.source === node.id ? edge.target : edge.source))];
  const related = relatedIds.flatMap((id) => {
    const item = MIND_MAP_NODES.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const alignRight = node.x > 840;
  const className = [
    "group absolute z-10 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    alignRight ? "-translate-x-full items-end text-right" : "-translate-x-1/2",
    "active:scale-[0.97]",
  ].filter(Boolean).join(" ");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${node.label}, ${node.kind}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={className}
          style={{ left: `${node.x / 10}%`, top: `${node.y / 5.8}%`, color } as CSSProperties}
        >
          <span className={[
            "relative grid place-items-center rounded-full border bg-background text-current shadow-sm transition-[transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] group-hover:scale-110",
            node.kind === "focus" ? "size-14 border-primary/70 shadow-[0_0_28px_color-mix(in_srgb,var(--primary)_28%,transparent)]" :
              node.kind === "context" ? "size-9 border-current/80" : "size-3 border-current bg-current",
            open ? "ring-2 ring-current ring-offset-2 ring-offset-background" : "",
          ].join(" ")}>
            {node.kind === "focus" ? <Network size={20} strokeWidth={1.6} /> : node.kind === "context" ? <span className="text-[10px] font-medium">{node.label.slice(0, 1)}</span> : null}
          </span>
          <span className={[
            "max-w-40 rounded-md border border-border bg-card/95 px-2 py-1 text-[11px] leading-tight text-foreground shadow-sm",
            node.kind === "focus" ? "font-medium" : "",
            node.kind === "context" ? "font-medium" : "text-muted-foreground",
          ].join(" ")}>
            {node.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] border-border bg-popover p-4" side="bottom" align={alignRight ? "end" : "start"} sideOffset={9}>
        <PopoverHeader>
          <PopoverTitle className="text-sm">{node.label}</PopoverTitle>
          <PopoverDescription className="text-xs leading-relaxed">{node.summary}</PopoverDescription>
        </PopoverHeader>
        {related.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Connected nodes</p>
            <div className="flex flex-wrap gap-1.5">
              {related.map((item) => (
                <Button key={item.id} asChild variant="outline" size="sm" className="h-8 text-xs active:scale-[0.97]">
                  <Link href={`/mind-map/${item.id}`}>{item.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button asChild size="sm" className="active:scale-[0.97]">
            <Link href={`/mind-map/${node.id}`}>Open page <ArrowUpRight size={13} /></Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MindMapView() {
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const byId = new Map(MIND_MAP_NODES.map((node) => [node.id, node]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted-foreground">Example relationship map</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Map groups">
          {MIND_MAP_GROUPS.map((group) => (
            <span key={group.id} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: group.color }} />{group.label}
            </span>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="relative h-[580px] min-w-[740px]" style={{ background: "radial-gradient(ellipse at 50% 48%, color-mix(in srgb, var(--muted) 78%, var(--background)) 0%, var(--background) 67%)" }}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(var(--muted-foreground)_0.65px,transparent_0.65px)] [background-size:22px_22px]" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 580" preserveAspectRatio="none" aria-hidden="true">
              {MIND_MAP_EDGES.map((edge) => {
                const path = edgePath(edge, byId);
                return path ? <path key={`${edge.source}-${edge.target}`} d={path.d} fill="none" stroke={path.color}
                  strokeWidth={edge.kind === "related" ? 1.35 : 1.15} strokeDasharray={path.related ? "4 5" : undefined}
                  opacity={path.related ? 0.62 : 0.38} vectorEffect="non-scaling-stroke" /> : null;
              })}
            </svg>
            {MIND_MAP_NODES.map((node) => (
              <NodeButton key={node.id} node={node} open={openNodeId === node.id}
                onOpenChange={(open) => setOpenNodeId(open ? node.id : null)} />
            ))}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Mind map</span> · select any node to explore
            </div>
          </div>
        </div>
      </Card>
      <p className="px-1 text-[11px] text-muted-foreground">Connections show how product goals, projects, and supporting knowledge can fit together.</p>
    </div>
  );
}
