"use client";

// T58's two card shapes, one component: a tag card is tiny ("add tag `x`?"),
// a topic card asks for the why (mission REQUIRED — map 06) before Accept can
// do anything. The mission textarea is controlled by the parent page (keyed
// by proposal id) so its value survives re-renders as the stack promotes.
import { Tag as TagIcon, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { Proposal } from "@/lib/proposals";

export function ProposalCard({
  item,
  mission,
  onMissionChange,
}: {
  item: Proposal;
  mission: string;
  onMissionChange: (v: string) => void;
}) {
  if (item.kind === "tag") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <TagIcon size={22} className="text-primary" />
        <p className="text-lg font-semibold text-foreground">
          add tag <code className="font-mono">{item.tag}</code>?
        </p>
        <p className="text-xs text-muted-foreground">
          study.py wants this in the controlled topic-tag list.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {item.count} saved items cluster on <code className="font-mono">{item.tag}</code>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        No topic owns this tag yet. Make it a topic?
      </p>
      <label className="mt-auto flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          why (required to accept)
        </span>
        <Textarea
          value={mission}
          onChange={(e) => onMissionChange(e.target.value)}
          placeholder="why do you want to learn this?"
          rows={3}
          className="text-sm"
        />
      </label>
    </div>
  );
}
