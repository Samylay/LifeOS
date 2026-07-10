// T36 — pure parsing of triage verdicts. Transport-agnostic (no I/O, no
// Telegram/voice assumptions): the /api/triage/reply route and the voice inbox
// both hand it text + the numbered proposed items and get verdicts back.
// Grammar (comma/semicolon/newline separated): "<n> <verb> [target]".
//   approve/ok/yes/y  → file to the item's proposed destination
//   vault             → file as a vault note
//   idea/idea-bank    → add to the content idea bank
//   backlog <centre>  → append to a learning backlog
//   skip/discard/no/x → discard
// Bare "<n>" means approve. A verb with no leading number applies to nothing
// (ignored) — numbers anchor every verdict to a specific card row.

export type TriageAction = "approve" | "vault" | "idea-bank" | "backlog" | "discard";

export interface TriageVerdict {
  n: number;
  action: TriageAction;
  centre?: string; // for backlog:<centre>
}

const VERB: Record<string, TriageAction> = {
  approve: "approve", ok: "approve", yes: "approve", y: "approve", keep: "approve", file: "approve",
  vault: "vault", note: "vault",
  idea: "idea-bank", "idea-bank": "idea-bank", ideabank: "idea-bank", ideas: "idea-bank", bank: "idea-bank",
  backlog: "backlog",
  skip: "discard", discard: "discard", no: "discard", n: "discard", x: "discard", drop: "discard", trash: "discard",
};

// One verdict clause: leading number, optional "to", a verb, optional centre.
const CLAUSE = /(\d+)\s*(?:to\s+)?([a-z-]+)?(?:\s*[:]\s*|\s+)?([a-z-]+)?/gi;

export function parseTriageReply(text: string): TriageVerdict[] {
  const out: TriageVerdict[] = [];
  const seen = new Set<number>();
  // Split on separators so "1 approve, 2 skip" yields two clean clauses, but
  // also tolerate "1 2 3 skip"-style shorthand within a clause below.
  for (const chunk of text.split(/[,;\n]+/)) {
    const s = chunk.trim().toLowerCase();
    if (!s) continue;
    CLAUSE.lastIndex = 0;
    const m = CLAUSE.exec(s);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || seen.has(n)) continue;
    const verbWord = m[2] ?? "";
    const action = VERB[verbWord] ?? "approve"; // bare number = approve
    if (action === "backlog") {
      const centre = normalizeCentre(m[3] ?? verbWord);
      if (!centre) continue; // backlog needs a valid centre
      out.push({ n, action, centre });
    } else {
      out.push({ n, action });
    }
    seen.add(n);
  }
  return out;
}

const CENTRES: Record<string, string> = {
  workouts: "workouts", workout: "workouts",
  polymath: "polymath",
  swe: "swe-learning", "swe-learning": "swe-learning", swelearning: "swe-learning",
  "software-engineering": "swe-learning", coding: "swe-learning",
};

export function normalizeCentre(word: string): string | null {
  return CENTRES[word.toLowerCase()] ?? null;
}
