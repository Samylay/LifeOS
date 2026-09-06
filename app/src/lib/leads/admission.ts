// Admission — the one gate a lead passes through before it can ever be shown.
//
// /leads collected 666 leads over a year and produced zero contacts: the bar
// to appear was zero, so the surface became a graveyard nobody could work
// through. This module is the fix, and it is deliberately dumb: pure
// judgement over a candidate, the current moment, and Samy's availability.
// No database, no filesystem, no network, no clock of its own — the caller
// (scout's ingest, or a future replay of a year of leads) always passes
// `now`. That is what makes "would this be shown right now" testable without
// scout running.
//
// Expiry is a *consequence* of isActionable re-evaluating against a later
// `now`, never a job that sweeps rows. A lead admitted yesterday simply stops
// being admitted today once its deadline has passed — nothing has to notice.

/** The contract scout's ingest must satisfy for a lead to be judged at all. */
export interface AdmissionCandidate {
  /** Stable identity used only for cap tie-breaking and continuity — never judged itself. */
  id: string;
  source: string;
  postedAt: Date;
  /** null means "unknown deadline" — handled explicitly below, never a fallthrough to admitted. */
  deadline: Date | null;
  counterparty: string;
  requirement: string;
  budgetFloor: number;
}

/**
 * Samy's global work-availability switch (settings, default OFF per the
 * 2026-09-06 decision) plus an optional manually-set snooze on top of it.
 * Neither field is ever derived from a calendar — both are values a human set.
 */
export interface Availability {
  openToWork: boolean;
  unavailableUntil: Date | null;
}

export interface AdmittedLead {
  id: string;
  reason: string;
}

/** Never more than a handful visible at once — the structural backstop against a second graveyard. */
export const ADMISSION_CAP = 5;

function isAvailable(availability: Availability, now: Date): boolean {
  if (!availability.openToWork) return false;
  if (availability.unavailableUntil === null) return true;
  return now.getTime() >= availability.unavailableUntil.getTime();
}

/**
 * Would this lead be shown right now? Three gates, all required:
 * the posting has actually gone live, it has a deadline that has not
 * passed, and Samy is available for work.
 *
 * A missing deadline is a decision, not a default: it returns false rather
 * than falling through to admitted, because a lead that can never expire on
 * its own is exactly the mechanism that produced the 653-item backlog.
 */
export function isActionable(candidate: AdmissionCandidate, now: Date, availability: Availability): boolean {
  if (candidate.postedAt.getTime() > now.getTime()) return false;
  if (candidate.deadline === null) return false;
  if (candidate.deadline.getTime() < now.getTime()) return false;
  if (!isAvailable(availability, now)) return false;
  return true;
}

/** The one short line the card shows: why this lead is here. */
export function admissionReason(candidate: AdmissionCandidate): string {
  const deadlineText = candidate.deadline ? candidate.deadline.toISOString().slice(0, 10) : "no deadline";
  return `${candidate.counterparty} needs ${candidate.requirement} — open until ${deadlineText}`;
}

/**
 * Which handful, out of everything on offer. This is the only place the cap
 * is enforced, so no caller can ever grow the visible set beyond it: filter
 * to what's actionable right now, then take the soonest-expiring first (the
 * ones that stop being actionable soonest are the most urgent to show), with
 * `id` as a final tie-break so the result is fully deterministic for a given
 * input rather than dependent on array order.
 *
 * `visible` (the currently-shown ids) is accepted for future use — e.g.
 * preferring continuity so a full surface doesn't visibly churn on ties —
 * but is not yet load-bearing: today's tie-break (deadline, then id) is
 * already deterministic without it.
 */
export function admit(
  candidates: AdmissionCandidate[],
  visible: string[],
  cap: number,
  now: Date,
  availability: Availability,
): AdmittedLead[] {
  void visible;
  return candidates
    .filter((c) => isActionable(c, now, availability))
    .sort((a, b) => {
      const byDeadline = (a.deadline as Date).getTime() - (b.deadline as Date).getTime();
      if (byDeadline !== 0) return byDeadline;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, Math.max(0, cap))
    .map((c) => ({ id: c.id, reason: admissionReason(c) }));
}
