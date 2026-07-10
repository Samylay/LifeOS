// T35 — Triage card: the morning surface for bookmark/save proposals.
// The nightly study step (~/services/triage/study.py) leaves triageQueue items
// at status:"proposed" with an Opus-written proposal (summary + destination).
// This lists them, numbered, for a same-morning voice/reply verdict (T36).
// Discards are surfaced separately and collapsed — Samy still gets to veto a
// discard, but they don't crowd the actionable proposals.
import { listDocs } from "../../server-db";
import { card, type FetchResult } from "../registry";

const MAX_ITEMS = 12;

interface QueuedProposal {
  summary?: string;
  why_relevant?: string;
  destination?: string;
  confidence?: string;
  rationale?: string;
}

export async function fetch(): Promise<FetchResult> {
  const proposed = listDocs("users/local/triageQueue", {
    where: [["status", "==", "proposed"]],
  });
  if (proposed.length === 0) return null; // nothing to triage → no card

  const items = proposed.slice(0, MAX_ITEMS).map((d, i) => {
    const p = (d.proposal ?? {}) as QueuedProposal;
    return {
      n: i + 1,
      id: String(d.id),
      url: String(d.url ?? ""),
      source: String(d.source ?? "other"),
      summary: p.summary ?? "",
      destination: p.destination ?? "discard",
      confidence: p.confidence ?? "low",
      rationale: p.rationale ?? "",
    };
  });

  const keep = items.filter((i) => i.destination !== "discard");
  const drop = items.filter((i) => i.destination === "discard");

  return card({
    id: "triage",
    type: "triage",
    priority: "action",
    status: keep.length > 0 ? "neutral" : "green",
    title: "Triage",
    link: "/pager",
    body: {
      keep,
      drop,
      total: proposed.length,
      shown: items.length,
      hint: 'Reply to file: "1 approve, 2 to vault, 3 skip". Unruled items wait.',
    },
  });
}
