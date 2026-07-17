// Ships — staleness counter-agent for the exit-velocity system
// (docs/exit-velocity.md).
//
// For each active project: days since anything left the machine (last shipLog
// entry for that project, falling back to project creation), sorted stalest
// first. Footer: ships in the last 30 days, and how many of those were
// OUTWARD-FACING (reached a real person / the public, not just Samy or the
// homelab). The tripwire fires on the outward count, not the total: 70 of 73
// ships in the 30d to 2026-07-16 were internal homelab work, so a total-based
// tripwire could never fire while Content OS sat at zero outward ships. See
// docs/exit-velocity.md "What counts".

import { listDocs } from "../../server-db";
import { card, type FetchResult } from "../registry";

const DAY_MS = 86_400_000;
const STALE_DAYS = 14;
const TRIPWIRE_WINDOW_DAYS = 30;

// Audiences that mean "never left the machine". Used only as the fallback when
// a ship has no explicit `outward` flag (all historical rows, pre-2026-07-17).
// Deliberately matches the recipient, not the work: an internal ship names Samy
// or the box; an outward one names someone else (a JECT member, the public, a
// client, site visitors). New ships should set `outward` explicitly via
// log-ship.sh so this heuristic isn't load-bearing.
// `lifeos` and `agents?` are internal here: LifeOS is single-user tailnet-only
// (its only "user" is Samy), and shipping to "future agent sessions" is internal
// tooling. Note "ecole" is deliberately NOT listed — "public visitors of
// ecole.samylayaida" is a real outward audience, and only "ecole / future
// agents" (caught by `agents`) is internal. Bias is toward internal on purpose:
// over-counting outward is the exact failure the outward tripwire exists to kill.
const INTERNAL_AUDIENCE =
  /\b(samy|self|myself|homelab|internal|localhost|local host|autoloop|cron|lifeos|agents?)\b/i;

/** `{ __date: iso }` marker (server-db storage format) -> epoch ms, or null. */
function dateMs(v: unknown): number | null {
  if (v && typeof v === "object" && "__date" in (v as object)) {
    const ms = Date.parse((v as { __date: string }).__date);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Did this ship reach someone other than Samy/the homelab? Explicit
 * `outward` wins (either polarity); otherwise infer from the audience and an
 * `internal` tag. Unknown/blank audience counts as internal — the tripwire's
 * job is to stay honest, so ambiguity must not inflate the outward count.
 */
export function isOutward(ship: Record<string, unknown>): boolean {
  if (typeof ship.outward === "boolean") return ship.outward;
  const tags = Array.isArray(ship.tags) ? (ship.tags as unknown[]).map(String) : [];
  if (tags.includes("internal")) return false;
  const to = String(ship.toWhom ?? "").trim();
  if (to === "") return false;
  return !INTERNAL_AUDIENCE.test(to);
}

export async function fetch(): Promise<FetchResult> {
  const projects = listDocs("users/local/projects");
  const ships = listDocs("users/local/shipLog");
  const now = Date.now();

  const inWindow = ships.filter((s) => {
    const ms = dateMs(s.date);
    return ms !== null && now - ms <= TRIPWIRE_WINDOW_DAYS * DAY_MS;
  });
  const shipped30 = inWindow.length;
  const shippedOutward30 = inWindow.filter(isOutward).length;

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

  const tripwire = shippedOutward30 === 0 && active.length > 0;
  const status = tripwire ? "red" : rows.some((r) => r.days > STALE_DAYS) ? "amber" : "green";

  return card({
    id: "ships",
    type: "ships",
    priority: "action",
    status,
    title: "Exit velocity",
    link: "/projects",
    body: { projects: rows, shipped_30d: shipped30, shipped_outward_30d: shippedOutward30, tripwire },
  });
}
