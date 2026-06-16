"use client";

import Link from "next/link";
import { Brain, FileText } from "lucide-react";
import { useKnowledge } from "@/lib/use-kb";

export function KnowledgeCard() {
  const { notes, enabled, loading } = useKnowledge();

  // Stay quiet if the vault isn't mounted (e.g. local dev without KB_PATH).
  if (!enabled && !loading) return null;
  if (loading && notes.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4 lg:p-5"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Knowledge
          </h2>
        </div>
        <Link href="/knowledge" className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Open
        </Link>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          No notes yet — <Link href="/knowledge" style={{ color: "var(--accent)" }}>capture one</Link>.
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.slice(0, 3).map((n) => (
            <Link
              key={n.path}
              href="/knowledge"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 -mx-2.5 transition-colors hover:bg-[var(--bg-tertiary)]"
            >
              <FileText size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
              <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                {n.title}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                {n.folder}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
