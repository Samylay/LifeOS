// T-decide-rework-08 — what may be put in front of a Claude Code session.
//
// A queued prompt is executed verbatim by an agent, and a triage item is text
// ingested from the internet, so the item's own words are never the source of
// an instruction. Samy writes it; the item supplies only its id, for the
// audit trail. This module is the one place that composes a queue entry, so
// the rule is testable without running the app.

export interface QueueBody {
  itemId: string;
  title: string;
  prompt: string;
}

// The heading inside the merged brief. Derived from Samy's instruction, never
// from the item — a title built from item text would smuggle ingested prose
// into the prompt through the back door.
export function titleFrom(instruction: string): string {
  return instruction.trim().split("\n")[0].slice(0, 80);
}

// Returns null when there is no instruction to send. Refusing here is the
// point: a blank box must never fall back to the item's summary to have
// something to say.
export function queueBodyFor(itemId: string, instruction: string): QueueBody | null {
  const prompt = instruction.trim();
  if (!prompt || !itemId) return null;
  return { itemId, title: titleFrom(prompt), prompt };
}
