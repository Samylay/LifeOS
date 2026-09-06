// The single on/off availability switch admission judges against (Samy's
// decision, 2026-09-06): a value a human sets, default OFF, never derived
// from a calendar. Same settings-collection-doc-per-feature pattern as
// nutrition-settings.ts.
//
// Only a getter lives here for this ticket. The switch's own UI — Samy
// telling the surface he is or isn't looking for work — is ticket 04's job
// ("what Samy does teaches the filter"); this ticket only needs admission to
// be able to *read* the switch, correctly defaulting to OFF when nothing has
// set it yet, which is itself part of why an unpurged surface stays empty.
import { getDoc, setDoc } from "@/lib/server-db";
import type { Availability } from "./admission";
import { parseStoredDate } from "./dates";

export const LEADS_SETTINGS_COLLECTION = "users/local/settings";
export const LEADS_SETTINGS_DOC_ID = "leads-availability";

export const DEFAULT_AVAILABILITY: Availability = { openToWork: false, unavailableUntil: null };

/** Pure parse of whatever's in the settings doc — tolerant of an absent doc,
 * a stale shape, or a non-boolean value, all of which fall back to OFF
 * rather than being treated as "on" by accident. */
export function parseAvailability(raw: unknown): Availability {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AVAILABILITY };
  const doc = raw as Record<string, unknown>;
  return {
    openToWork: doc.openToWork === true,
    unavailableUntil: parseStoredDate(doc.unavailableUntil),
  };
}

export function getLeadsAvailability(): Availability {
  return parseAvailability(getDoc(LEADS_SETTINGS_COLLECTION, LEADS_SETTINGS_DOC_ID));
}

/** Not called anywhere yet — kept so ticket 04's switch has a write path
 * ready without re-deriving the settings-doc shape. */
export function setLeadsAvailability(partial: Partial<Availability>): Availability {
  const next = { ...getLeadsAvailability(), ...partial };
  setDoc(LEADS_SETTINGS_COLLECTION, LEADS_SETTINGS_DOC_ID, next, true);
  return next;
}
