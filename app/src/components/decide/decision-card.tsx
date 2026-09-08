"use client";

import { Badge } from "@/components/ui/badge";
import { CompactText } from "@/components/ui/compact-text";
import { ActionEffect, ContextDetails, Provenance } from "@/components/ui/decision-context";
import type { DecisionItem } from "@/lib/decisions";

export function DecisionCard({ item }: { item: DecisionItem }) {
  const b = item.brief;
  const rec = (b?.recommendation ?? "").toLowerCase();
  const recClass = rec.startsWith("approve") ? "text-success" : rec.startsWith("reject") ? "text-destructive" : "text-warning";
  return (
    <article className="space-y-4 p-4 sm:p-5">
      <Provenance label="Approval request"><Badge variant="secondary">{item.project}</Badge></Provenance>
      <h2 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{item.title}</h2>
      {b ? <>
        <CompactText text={b.what} limit={150} className="text-muted-foreground" />
        <ActionEffect label="If approved">
          {/* Consequences stay complete before approval, including qualifiers. */}
          <p className="[overflow-wrap:anywhere]">{b.if_approve}</p>
        </ActionEffect>
        <div className="text-sm leading-relaxed"><span className="font-medium">If left: </span><span className="text-muted-foreground">{b.if_ignore}</span></div>
        <CompactText text={b.recommendation} limit={130} className={recClass} />
        <ContextDetails label="Blocker and exact action">
          <p className="text-muted-foreground">{b.why_blocked}</p>
          {b.action && <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{b.action}</pre>}
        </ContextDetails>
      </> : <p className="text-sm text-muted-foreground">No brief yet. Read the original request below.</p>}
      <ContextDetails label="Original request">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{item.block}</pre>
        <p className="text-xs text-muted-foreground">{item.sourcePath.replace("/home/quorky/", "~/")}</p>
      </ContextDetails>
      <p className="text-xs text-muted-foreground">Your choice is saved now and applied nightly. Approval does not run it.</p>
    </article>
  );
}
