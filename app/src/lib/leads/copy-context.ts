// Copy-context assembly — the one gesture ticket 03 promises: one paste,
// everywhere Samy writes. House law is absolute here: this function may only
// lay out facts already delivered for the lead in "Label: value" lines. It
// must never compose a sentence, a greeting, or anything resembling outreach
// wording — what Samy sends is his to write, not the app's.
//
// A field the lead never delivered is omitted outright, never rendered as a
// blank line or a placeholder like "N/A": a thin lead should produce a
// shorter block, not a padded one (ticket 03's fifth checkbox).
export interface CopyContextLead {
  counterparty: string;
  requirement: string;
  deadline: Date | null;
  budget: string;
  url: string;
}

export interface CopyContextRelatedWork {
  title: string;
  path: string;
}

export function buildCopyContext(lead: CopyContextLead, relatedWork: CopyContextRelatedWork[]): string {
  const lines: string[] = [];
  if (lead.counterparty.trim()) lines.push(`Counterparty: ${lead.counterparty.trim()}`);
  if (lead.requirement.trim()) lines.push(`Needs: ${lead.requirement.trim()}`);
  if (lead.deadline) lines.push(`Deadline: ${lead.deadline.toISOString().slice(0, 10)}`);
  if (lead.budget.trim()) lines.push(`Budget: ${lead.budget.trim()}`);
  if (lead.url.trim()) lines.push(`Source: ${lead.url.trim()}`);

  if (relatedWork.length > 0) {
    lines.push("");
    lines.push("Related work:");
    for (const w of relatedWork) lines.push(`- ${w.title} (${w.path})`);
  }

  return lines.join("\n");
}
