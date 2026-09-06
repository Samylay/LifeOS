// The leads surface — the seam between "whatever scout (or ticket 01's Pain
// deck migration) put in SQLite" and admission's pure judgement. It has two
// jobs: turn a raw stored lead doc into the AdmissionCandidate contract
// admission.ts expects, and keep already-acted-on leads out of the running so
// they never occupy one of the cap's handful of slots.
//
// Why status is filtered here and not inside admission: admission (ticket 01)
// judges *actionability* — deadline, availability — and deliberately knows
// nothing about the app's status field, so it stays testable as a replay of
// raw leads with no notion of "contacted". Whether an already-contacted lead
// should compete for a slot is a surface-construction question, not an
// admission question, so it lives here.
//
// Note on `deadline`: no lead in the collection carries one yet — scout's
// ingest contract (spec.md, "the strict filter is cross-repo") hasn't been
// updated to deliver it. `toAdmissionCandidate` maps a missing deadline to
// `null`, and admission's documented rule for `null` is "never admitted".
// That is not a bug in this ticket: it is what keeps the 732-row unpurged
// backlog from ever appearing on this surface before ticket 05's purge runs,
// without this module deleting or touching a single row.
import { admit, ADMISSION_CAP, type AdmissionCandidate, type AdmittedLead, type Availability } from "./admission";
import { parseStoredDate } from "./dates";

/** The shape a lead doc actually has in SQLite — permissive, since old rows
 * predate fields this ticket relies on and new ones may still be missing them. */
export interface RawLeadDoc {
  id: string;
  status?: unknown;
  source?: unknown;
  postedAt?: unknown;
  deadline?: unknown;
  counterparty?: unknown;
  requirement?: unknown;
  title?: unknown;
  categories?: unknown;
  budgetFloor?: unknown;
  [key: string]: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Raw doc -> the contract admission judges. `now` backstops a missing
 * `postedAt` (every real ingest sets one; a doc that somehow lacks it is
 * treated as posted this instant rather than failing the "has it gone live"
 * check in either direction).
 */
export function toAdmissionCandidate(doc: RawLeadDoc, now: Date): AdmissionCandidate {
  return {
    id: doc.id,
    source: str(doc.source) || "unknown",
    postedAt: parseStoredDate(doc.postedAt) ?? now,
    deadline: parseStoredDate(doc.deadline),
    counterparty: str(doc.counterparty) || str(doc.title),
    requirement: str(doc.requirement) || str(doc.categories),
    budgetFloor: num(doc.budgetFloor),
  };
}

/** A lead is still in the running only while nothing has been done about it
 * yet. Missing status is treated as "new" — the same default the client
 * hooks apply — rather than excluded. */
function isEligibleStatus(doc: RawLeadDoc): boolean {
  return doc.status === undefined || doc.status === "new";
}

/**
 * Which handful of raw leads reach the surface right now. This is the one
 * function the leads API route calls — the cap is enforced here, at the
 * fetch boundary, so nothing downstream (a client, a widened query) can grow
 * the visible set past it.
 */
export function selectAdmittedLeads(
  rows: RawLeadDoc[],
  now: Date,
  availability: Availability,
  cap: number = ADMISSION_CAP,
): AdmittedLead[] {
  const candidates = rows.filter(isEligibleStatus).map((doc) => toAdmissionCandidate(doc, now));
  return admit(candidates, [], cap, now, availability);
}

/** When scout last delivered anything at all, admitted or not — the fact the
 * empty state needs to tell "quiet" from "broken" apart. `null` means the
 * collection has never received a single lead. */
export function lastDeliveredAt(rows: RawLeadDoc[]): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    const created = parseStoredDate(row.createdAt);
    if (created && (!latest || created.getTime() > latest.getTime())) latest = created;
  }
  return latest;
}
