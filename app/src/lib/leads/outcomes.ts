// Outcomes — the closed sets ticket 04 records against a lead once Samy acts
// on it, plus the pure logic for turning an action into a write.
//
// Two house-law constraints shape this file. First, a pass reason is never
// free text: an open text box is manual entry, and an unbounded list of
// reasons teaches the upstream filter nothing, so PASS_REASONS is closed and
// short, and a value outside it is rejected rather than stored. Second,
// recording an outcome must never grow a pile Samy has to look at — this
// module only ever produces a status transition (contacted/won/lost/passed)
// plus the one date field that transition earns; surface.ts (ticket 02/03)
// already excludes every status but `new` from the surface, so writing one
// of these is what makes a lead leave for good, not an extra sweep step.
//
// Pure and I/O-free like every other module in this directory: the caller
// (use-leads.ts on the client) supplies `now` and performs the actual write.

/** Fixed choices for why a lead was passed on. Closed by design — this is
 * the whole signal scout's filter gets, so it has to be a short, stable
 * vocabulary rather than whatever Samy felt like typing that day. */
export const PASS_REASONS = ["budget-too-low", "not-a-fit", "vague-brief", "no-capacity", "other"] as const;

export type PassReason = (typeof PASS_REASONS)[number];

export const PASS_REASON_LABELS: Record<PassReason, string> = {
  "budget-too-low": "Budget too low",
  "not-a-fit": "Not a fit",
  "vague-brief": "Brief too vague",
  "no-capacity": "No capacity right now",
  other: "Other",
};

export function isPassReason(value: unknown): value is PassReason {
  return typeof value === "string" && (PASS_REASONS as readonly string[]).includes(value);
}

/** The write payload for a pass: one status transition, one reason from the
 * closed set, one date. Throws on an out-of-set reason rather than silently
 * storing garbage the filter would have to special-case later. */
export interface PassUpdate {
  status: "passed";
  passReason: PassReason;
  passedAt: Date;
}

export function buildPassUpdate(reason: PassReason, now: Date): PassUpdate {
  if (!isPassReason(reason)) {
    throw new Error(`not a pass reason: ${String(reason)}`);
  }
  return { status: "passed", passReason: reason, passedAt: now };
}

/** The three outcomes a lead can be moved through beyond passing. Contacted
 * is not final — Samy still needs to record won or lost against the same
 * lead — but per the settled admission contract (surface.test.ts) any status
 * other than `new` already leaves the surface immediately, so this ticket
 * does not attempt to keep a contacted lead visible for a later visit; it
 * only guarantees each transition stamps its own date. */
export const LEAD_OUTCOMES = ["contacted", "won", "lost"] as const;

export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

export function isLeadOutcome(value: unknown): value is LeadOutcome {
  return typeof value === "string" && (LEAD_OUTCOMES as readonly string[]).includes(value);
}

/** Each outcome stamps its own field so contacted/won/lost can each be read
 * back independently later (spec.md story 11: judge the filter against
 * money) rather than overloading a single generic `updatedAt`. */
export interface OutcomeUpdate {
  status: LeadOutcome;
  contactedAt?: Date;
  wonAt?: Date;
  lostAt?: Date;
}

export function buildOutcomeUpdate(outcome: LeadOutcome, now: Date): OutcomeUpdate {
  if (!isLeadOutcome(outcome)) {
    throw new Error(`not a lead outcome: ${String(outcome)}`);
  }
  switch (outcome) {
    case "contacted":
      return { status: "contacted", contactedAt: now };
    case "won":
      return { status: "won", wonAt: now };
    case "lost":
      return { status: "lost", lostAt: now };
  }
}

/** What a pass-recording caller (an outside filter, e.g. scout) needs back
 * per row: never more than id/source/reason/date — no title, no brief, none
 * of the fields that would make this a second surface to read for its own
 * sake rather than a feedback signal. */
export interface PassRecord {
  id: string;
  source: string;
  reason: PassReason;
  passedAt: Date | null;
}

/** Minimal shape this reads from a raw stored doc — deliberately narrower
 * than surface.ts's RawLeadDoc, since this has no business with most of a
 * lead's fields. */
export interface PassedLeadDoc {
  id: string;
  status?: unknown;
  source?: unknown;
  passReason?: unknown;
  passedAt?: unknown;
}

/**
 * Bulk retrieval for an outside caller (spec.md: "pass reasons are
 * retrievable in bulk"). Only rows actually marked `passed` with a reason
 * from the closed set are returned — a row missing or predating `passReason`
 * (the 13 legacy passes, or any write that raced this ticket) is silently
 * excluded rather than reported with a fabricated reason.
 */
export function selectPassRecords(
  rows: PassedLeadDoc[],
  parseDate: (value: unknown) => Date | null,
): PassRecord[] {
  const records: PassRecord[] = [];
  for (const row of rows) {
    if (row.status !== "passed") continue;
    if (!isPassReason(row.passReason)) continue;
    records.push({
      id: row.id,
      source: typeof row.source === "string" ? row.source : "unknown",
      reason: row.passReason,
      passedAt: parseDate(row.passedAt),
    });
  }
  return records;
}
