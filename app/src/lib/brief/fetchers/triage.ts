// T35 — Triage cards: the morning surface for bookmark/save proposals, split
// by source so X bookmarks and IG saves are ruled on separately (Samy's call
// 2026-07-10). One card per source that has proposed items; within each card,
// items are numbered 1..N over that source's proposed set (createdAt asc) — the
// same order /api/triage/reply re-derives per source, so the number is the
// handle. Discards are collapsed behind a review toggle; keeps always show.
import { listDocs } from "../../server-db";
import { card, type FetchResult } from "../registry";
import type { BriefCard } from "@/lib/brief-types";

const MAX_ITEMS = 12;

interface QueuedProposal {
  summary?: string; why_relevant?: string; destination?: string;
  confidence?: string; rationale?: string;
}

const SOURCE_META: Record<string, { title: string; label: string }> = {
  x: { title: "Triage · X", label: "x" },
  instagram: { title: "Triage · Instagram", label: "instagram" },
  other: { title: "Triage · Links", label: "other" },
};
const SOURCE_ORDER = ["x", "instagram", "other"];

function cardForSource(source: string, docs: Record<string, unknown>[]): BriefCard {
  const all = docs.map((d, i) => {
    const p = (d.proposal ?? {}) as QueuedProposal;
    return {
      n: i + 1,
      id: String(d.id),
      url: String(d.url ?? ""),
      source,
      summary: p.summary ?? "",
      destination: p.destination ?? "discard",
      confidence: p.confidence ?? "low",
      rationale: p.rationale ?? "",
    };
  });
  const keep = all.filter((i) => i.destination !== "discard");
  const drop = all
    .filter((i) => i.destination === "discard")
    .slice(0, Math.max(0, MAX_ITEMS - keep.length));

  const meta = SOURCE_META[source] ?? { title: `Triage · ${source}`, label: source };
  return card({
    id: `triage-${source}`,
    type: "triage",
    priority: "action",
    status: keep.length > 0 ? "neutral" : "green",
    title: meta.title,
    link: "/pager",
    body: {
      source: meta.label,
      keep,
      drop,
      total: docs.length,
      shown: keep.length + drop.length,
      hint: 'Reply to file: "1 approve, 2 to vault, 3 skip". Unruled items wait.',
    },
  });
}

export async function fetch(): Promise<FetchResult> {
  const proposed = listDocs("users/local/triageQueue", {
    where: [["status", "==", "proposed"]],
    orderBy: ["createdAt", "asc"],
  });
  if (proposed.length === 0) return null;

  const bySource = new Map<string, Record<string, unknown>[]>();
  for (const d of proposed) {
    const src = String(d.source ?? "other");
    (bySource.get(src) ?? bySource.set(src, []).get(src)!).push(d);
  }

  const sources = [...bySource.keys()].sort(
    (a, b) => (SOURCE_ORDER.indexOf(a) + 1 || 99) - (SOURCE_ORDER.indexOf(b) + 1 || 99)
  );
  return sources.map((s) => cardForSource(s, bySource.get(s)!));
}
