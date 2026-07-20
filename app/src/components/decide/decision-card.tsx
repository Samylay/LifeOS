"use client";

// One NEEDS-SAMY card: the claude-written context brief (what's asked, the
// real blocker, approve-vs-ignore consequences, the concrete command, a
// recommendation) so Samy can rule without opening the repo.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DecisionItem } from "@/lib/decisions";

function Field({ label, value, className }: { label: string; value?: string; className?: string }) {
  if (!value) return null;
  return (
    <div className="text-sm leading-relaxed">
      <span className="font-medium text-muted-foreground">{label} </span>
      <span className={className ?? "text-foreground"}>{value}</span>
    </div>
  );
}

export function DecisionCard({ item }: { item: DecisionItem }) {
  const [showRaw, setShowRaw] = useState(false);
  const b = item.brief;
  const rec = (b?.recommendation ?? "").toLowerCase();
  const recClass = rec.startsWith("approve") ? "text-success" : rec.startsWith("reject") ? "text-destructive" : "text-warning";

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-xs">
        <Badge className="rounded bg-accent font-medium uppercase tracking-wide text-accent-foreground">
          {item.project}
        </Badge>
        <span className="text-muted-foreground">needs your call</span>
      </div>

      <h2 className="text-lg font-semibold leading-snug text-foreground">
        {item.title}
      </h2>

      {b ? (
        <div className="space-y-2">
          <Field label="Ask:" value={b.what} />
          <Field label="Blocked because:" value={b.why_blocked} />
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <Field label="If you approve:" value={b.if_approve} />
            <Field label="If you ignore:" value={b.if_ignore} />
            {b.action && (
              <div className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs text-muted-foreground">
                {b.action}
              </div>
            )}
          </div>
          <Field label="Recommendation:" value={b.recommendation} className={recClass} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No context brief yet — the nightly enrichment fills this in; raw entry below.
        </p>
      )}

      <button onClick={() => setShowRaw((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.97]">
        <ChevronDown size={12}
          style={{ transform: showRaw ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out-custom)" }} />
        raw ROADMAP entry
      </button>
      {showRaw && (
        <pre className="max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {item.block}
        </pre>
      )}
      <p className="text-xs text-muted-foreground">
        Ruling is recorded now and written into {item.sourcePath.replace("/home/quorky/", "~/")} on the nightly pass — nothing executes automatically.
      </p>
    </div>
  );
}
