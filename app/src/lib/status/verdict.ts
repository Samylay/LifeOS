// T-status-rework-01 — "is anything wrong", as a pure function.
//
// /status becomes the operational surface: it owes Samy a verdict, not
// dashboards. This module makes that verdict testable without a homelab —
// gathering (getAllContainers, getHostMetrics, getStandingGoals, delivery
// health) stays with the callers; here we only judge what they returned.
//
// The cautionary tale this module is written against is the notify-pipeline
// goal, which asserted the easy thing (a row was written) and stayed green
// through a total outage. So: unknown is never all-clear, and a signal we
// could not gather is a problem, not a default.
import type { StandingGoals, HostMetrics } from "@/lib/metrics";
import type { ContainerInfo } from "@/lib/system-health";

export interface DeliveryHealth {
  subscriptions: number;
  lastDeliveredAt: string | null; // ISO, or null if nothing has ever delivered
}

export interface StatusSignals {
  goals: StandingGoals;
  containers: { ok: boolean; containers: ContainerInfo[]; reason?: string };
  host: HostMetrics;
  delivery: DeliveryHealth;
}

// Ordered worst-first within the list as a whole: goals lead because a failing
// invariant is a truer health signal than container uptime.
export type ProblemKind = "goal" | "goal-unknown" | "container" | "host" | "delivery";
export type Severity = "down" | "warn";

export interface Problem {
  kind: ProblemKind;
  severity: Severity;
  title: string;
  detail: string;
}

// Host thresholds. Warn only — a full disk is worth surfacing, but it is not
// the same class of event as a failing invariant or a dead container.
export const HOST_WARN = { cpuPct: 90, memPct: 90, diskPct: 90 };

// A watchdog that has not reported in this long is itself a problem: silence
// from it must be distinguishable from success.
export const WATCHDOG_STALE_SECONDS = 26 * 60 * 60;

export function problems(signals: StatusSignals): Problem[] {
  const out: Problem[] = [];
  const { goals, containers, host, delivery } = signals;

  // 1. Standing goals — the truest signal, so first.
  if (!goals.enabled) {
    // Metrics absent from Prometheus. NOT all-clear — this is the exact hole
    // the notify-pipeline goal fell into.
    out.push({
      kind: "goal-unknown",
      severity: "warn",
      title: "Goal status unknown",
      detail: "homelab_goal_up is not in Prometheus — the watchdog signal is missing, not clear.",
    });
  } else {
    for (const goal of goals.violated) {
      out.push({ kind: "goal", severity: "down", title: goal, detail: "standing goal failing" });
    }
    for (const goal of goals.flapped24h) {
      out.push({
        kind: "goal",
        severity: "warn",
        title: goal,
        detail: "recovered, but dipped in the last 24h",
      });
    }
    if (goals.lastRunAgeSeconds !== null && goals.lastRunAgeSeconds > WATCHDOG_STALE_SECONDS) {
      out.push({
        kind: "goal-unknown",
        severity: "warn",
        title: "Goal watchdog is stale",
        detail: `last ran ${Math.floor(goals.lastRunAgeSeconds / 3600)}h ago`,
      });
    }
  }

  // 2. Containers down or unhealthy.
  if (!containers.ok) {
    out.push({
      kind: "container",
      severity: "down",
      title: "Container status unknown",
      detail: containers.reason ?? "could not read Docker",
    });
  } else {
    for (const c of containers.containers) {
      if (!c.up) {
        out.push({
          kind: "container",
          severity: "down",
          title: c.label ?? c.name,
          detail: c.status || c.state,
        });
      } else if (/unhealthy/i.test(c.status)) {
        out.push({
          kind: "container",
          severity: "warn",
          title: c.label ?? c.name,
          detail: c.status,
        });
      }
    }
  }

  // 3. Host thresholds.
  if (host.enabled) {
    const checks: Array<[number | null, number, string]> = [
      [host.diskPct, HOST_WARN.diskPct, "disk"],
      [host.memPct, HOST_WARN.memPct, "memory"],
      [host.cpuPct, HOST_WARN.cpuPct, "cpu"],
    ];
    for (const [value, threshold, label] of checks) {
      if (value !== null && value >= threshold) {
        out.push({
          kind: "host",
          severity: "warn",
          title: `${label} at ${Math.round(value)}%`,
          detail: `over ${threshold}%`,
        });
      }
    }
  }

  // 4. Delivery health. Zero subscriptions is a problem, not a quiet default:
  // sendPushToAll returns attempted:0 and looks successful with no subs, which
  // is how six weeks of dark delivery went unnoticed.
  if (delivery.subscriptions === 0) {
    out.push({
      kind: "delivery",
      severity: "down",
      title: "Push delivery reaches nobody",
      detail: "no push subscriptions — alerts generate but are not delivered.",
    });
  }

  return out;
}

// The single verdict driving the empty-page state. "unknown" is deliberately
// distinct from "clear": a surface that cannot tell must not claim health.
export type Verdict = "clear" | "problems" | "unknown";

export function verdict(signals: StatusSignals): Verdict {
  const list = problems(signals);
  if (list.length === 0) return "clear";
  // If the only things wrong are unknowns, the honest verdict is "unknown",
  // not "problems" — we do not know that anything is actually broken.
  if (list.every((p) => p.kind === "goal-unknown")) return "unknown";
  return "problems";
}

export function isAllClear(signals: StatusSignals): boolean {
  return verdict(signals) === "clear";
}
