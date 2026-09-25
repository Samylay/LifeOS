export function monthLabel(month: string, short = false) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
}
