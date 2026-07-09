// Ships — staleness counter-agent for the exit-velocity system
// (docs/exit-velocity.md).
//
// For each active project: days since anything left the machine (last shipLog
// entry for that project, falling back to project creation), sorted stalest
// first. Footer: ships across all projects in the last 30 days. That count at
// zero is the tripwire — building the tracker instead of shipping — and turns
// the card red.

import { listDocs } from "../../server-db";
import { card, type FetchResult } from "../registry";

const DAY_MS = 86_400_000;
const STALE_DAYS = 14;
const TRIPWIRE_WINDOW_DAYS = 30;

/** `{ __date: iso }` marker (server-db storage format) -> epoch ms, or null. */
function dateMs(v: unknown): number | null {
  if (v && typeof v === "object" && "__date" in (v as object)) {
    const ms = Date.parse((v as { __date: string }).__date);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export async function fetch(): Promise<FetchResult> {
  const projects = listDocs("users/local/projects");
  const ships = listDocs("users/local/shipLog");
  const now = Date.now();

  const shipped30 = ships.filter((s) => {
    const ms = dateMs(s.date);
    return ms !== null && now - ms <= TRIPWIRE_WINDOW_DAYS * DAY_MS;
  }).length;

  const active = projects.filter((p) => p.status === "active");
  const rows = active
    .map((p) => {
      const lastShipMs = ships
        .filter((s) => s.projectId === p.id)
        .reduce<number | null>((acc, s) => {
          const ms = dateMs(s.date);
          return ms !== null && (acc === null || ms > acc) ? ms : acc;
        }, null);
      const sinceMs = lastShipMs ?? dateMs(p.createdAt) ?? now;
      return {
        title: String(p.title ?? "(untitled)"),
        days: Math.floor((now - sinceMs) / DAY_MS),
        never_shipped: lastShipMs === null,
        shipping_event: (p.shippingEvent as string | undefined) ?? null,
      };
    })
    .sort((a, b) => b.days - a.days);

  const tripwire = shipped30 === 0 && active.length > 0;
  const status = tripwire ? "red" : rows.some((r) => r.days > STALE_DAYS) ? "amber" : "green";

  return card({
    id: "ships",
    type: "ships",
    priority: "action",
    status,
    title: "Exit velocity",
    link: "/projects",
    body: { projects: rows, shipped_30d: shipped30, tripwire },
  });
}
