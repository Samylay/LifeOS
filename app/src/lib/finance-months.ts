// Month enumeration for the /finance burn history (finance-rework ticket 02).
// Pure date arithmetic, no I/O — kept separate from finance-burn.ts (ticket
// 01's closed scope: burn arithmetic and recurrence, not month bookkeeping).

/**
 * The `count` calendar months ending on the month containing `referenceDate`,
 * oldest first — e.g. `recentMonths("2026-09-06", 6)` covers 2026-04..2026-09.
 * Used to size the burn-history read to the "six months of history" the spec
 * calls for, without a caller re-deriving month math inline.
 */
export function recentMonths(referenceDate: string | Date, count: number): string[] {
  const ref = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth(); // 0-indexed
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}
