"use client";

// One NEEDS-SAMY card: the claude-written context brief (what's asked, the
// real blocker, approve-vs-ignore consequences, the concrete command, a
// recommendation) so Samy can rule without opening the repo.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DecisionItem } from "@/lib/decisions";

function Field({ label, value, color }: { label: string; value?: string; color?: string }) {
  if (!value) return null;
  return (
    <div className="text-sm leading-relaxed">
      <span className="font-medium" style={{ color: "var(--text-tertiary)" }}>{label} </span>
      <span style={{ color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

export function DecisionCard({ item }: { item: DecisionItem }) {
  const [showRaw, setShowRaw] = useState(false);
  const b = item.brief;
  const rec = (b?.recommendation ?? "").toLowerCase();
  const recColor = rec.startsWith("approve") ? "#22C55E" : rec.startsWith("reject") ? "#EF4444" : "#F59E0B";

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded px-1.5 py-0.5 font-medium uppercase tracking-wide"
          style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
          {item.project}
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>needs your call</span>
      </div>

      <h2 className="text-lg font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
        {item.title}
      </h2>

      {b ? (
        <div className="space-y-2">
          <Field label="Ask:" value={b.what} />
          <Field label="Blocked because:" value={b.why_blocked} />
          <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-tertiary)" }}>
            <Field label="If you approve:" value={b.if_approve} />
            <Field label="If you ignore:" value={b.if_ignore} />
            {b.action && (
              <div className="text-xs font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap"
                style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                {b.action}
              </div>
            )}
          </div>
          <Field label="Recommendation:" value={b.recommendation} color={recColor} />
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          No context brief yet — the nightly enrichment fills this in; raw entry below.
        </p>
      )}

      <button onClick={() => setShowRaw((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
        style={{ color: "var(--text-tertiary)" }}>
        <ChevronDown size={12}
          style={{ transform: showRaw ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out-custom)" }} />
        raw ROADMAP entry
      </button>
      {showRaw && (
        <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          {item.block}
        </pre>
      )}
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Ruling is recorded now and written into {item.sourcePath.replace("/home/quorky/", "~/")} on the nightly pass — nothing executes automatically.
      </p>
    </div>
  );
}
