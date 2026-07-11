// NEEDS-SAMY decision cards — shared types for the /decide deck. Items are
// produced host-side by ~/services/triage/decisions.py and stored in
// users/local/decisionQueue; the ROADMAP write-back also happens host-side.

export const DECISION_VERDICTS = ["approved", "rejected", "deferred", "discuss"] as const;
export type DecisionVerdict = (typeof DECISION_VERDICTS)[number];

// The claude-written context brief that makes the card decidable without
// opening the repo.
export interface DecisionBrief {
  what: string;
  why_blocked: string;
  if_approve: string;
  if_ignore: string;
  action: string; // the concrete command/step approval implies
  recommendation: string;
}

export interface DecisionItem {
  id: string;
  hash: string;
  project: string;
  sourcePath: string;
  title: string;
  block: string; // the raw ROADMAP task block
  brief?: DecisionBrief | null;
  status: "pending" | "decided" | "applied" | "gone";
  verdict?: DecisionVerdict;
  note?: string;
}
