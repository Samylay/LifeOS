"use client";

// T58's two card shapes, one component: a tag card is tiny ("add tag `x`?"),
// a topic card asks for the why (mission REQUIRED — map 06) before Accept can
// do anything. The mission textarea is controlled by the parent page (keyed
// by proposal id) so its value survives re-renders as the stack promotes.
import { Tag as TagIcon, Sparkles } from "lucide-react";
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
        <TagIcon size={22} style={{ color: "var(--accent)" }} />
        <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          add tag <code className="font-mono">{item.tag}</code>?
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          study.py wants this in the controlled topic-tag list.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <Sparkles size={18} style={{ color: "var(--accent)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {item.count} saved items cluster on <code className="font-mono">{item.tag}</code>
        </p>
      </div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        No topic owns this tag yet. Make it a topic?
      </p>
      <label className="mt-auto flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
          why (required to accept)
        </span>
        <textarea
          value={mission}
          onChange={(e) => onMissionChange(e.target.value)}
          placeholder="why do you want to learn this?"
          rows={3}
          className="rounded-lg p-2.5 text-sm outline-none"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
        />
      </label>
    </div>
  );
}
