// Shared date parsing for the leads surface. Stored docs carry dates as
// `{ __date: iso }` markers (the server-db convention — see server-db.ts),
// but this module also accepts a plain ISO string or a `Date` so callers
// (tests, future ingest changes) never have to know which shape they hold.
//
// Missing or unparseable input is `null`, never a silent fallback to "now" or
// epoch — a candidate with an unreadable date should be handled explicitly by
// its caller (admission already treats a null deadline as "not admitted"),
// not quietly coerced into something that looks admissible.
export function parseStoredDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof value === "object" && "__date" in (value as Record<string, unknown>)) {
    return parseStoredDate((value as { __date: unknown }).__date);
  }
  return null;
}
