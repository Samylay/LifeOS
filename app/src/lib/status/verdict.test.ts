import { describe, it, expect } from "vitest";
import {
  HOST_WARN,
  WATCHDOG_STALE_SECONDS,
  isAllClear,
  problems,
  verdict,
  type StatusSignals,
} from "./verdict";

const GREEN: StatusSignals = {
  goals: { enabled: true, total: 44, ok: 44, violated: [], flapped24h: [], lastRunAgeSeconds: 3600 },
  containers: { ok: true, containers: [{ name: "lifeos", up: true, state: "running", status: "Up 2 days" }] },
  host: {
    enabled: true, cpuPct: 12, memPct: 40, memUsedBytes: null, memTotalBytes: null,
    diskPct: 55, diskUsedBytes: null, diskTotalBytes: null, load1: 0.4, uptimeSeconds: 100,
  },
  delivery: { subscriptions: 2, lastDeliveredAt: "2026-09-06T06:00:00.000Z" },
};

const sig = (patch: Partial<StatusSignals>): StatusSignals => ({ ...GREEN, ...patch });

describe("all green is all clear", () => {
  it("produces no problems and an empty-page verdict", () => {
    expect(problems(GREEN)).toEqual([]);
    expect(verdict(GREEN)).toBe("clear");
    expect(isAllClear(GREEN)).toBe(true);
  });
});

describe("failing standing goals lead, because they are the truest signal", () => {
  it("a failing goal is a problem even when every container is up", () => {
    const s = sig({ goals: { ...GREEN.goals, ok: 43, violated: ["backup-fresh"] } });
    const p = problems(s);
    expect(p[0]).toMatchObject({ kind: "goal", severity: "down", title: "backup-fresh" });
    expect(isAllClear(s)).toBe(false);
  });

  it("orders goals ahead of containers, host and delivery", () => {
    const s = sig({
      goals: { ...GREEN.goals, violated: ["backup-fresh"] },
      containers: { ok: true, containers: [{ name: "n8n", up: false, state: "exited", status: "Exited (1)" }] },
      host: { ...GREEN.host, diskPct: 97 },
      delivery: { subscriptions: 0, lastDeliveredAt: null },
    });
    expect(problems(s).map((x) => x.kind)).toEqual(["goal", "container", "host", "delivery"]);
  });

  it("surfaces a goal that dipped overnight and recovered", () => {
    const s = sig({ goals: { ...GREEN.goals, flapped24h: ["claude-auth"] } });
    expect(problems(s)).toEqual([
      { kind: "goal", severity: "warn", title: "claude-auth", detail: "recovered, but dipped in the last 24h" },
    ]);
  });

  it("a stale watchdog is a problem — silence is not success", () => {
    const s = sig({ goals: { ...GREEN.goals, lastRunAgeSeconds: WATCHDOG_STALE_SECONDS + 60 } });
    expect(problems(s).some((p) => p.title === "Goal watchdog is stale")).toBe(true);
  });

  it("passing goals produce nothing — 44 greens must not bury one red", () => {
    expect(problems(sig({ goals: { ...GREEN.goals, ok: 44, total: 44 } }))).toEqual([]);
  });
});

describe("unknown is never all-clear", () => {
  // The notify-pipeline goal asserted the easy thing and stayed green through
  // a total outage. A surface that cannot tell must not claim health.
  it("absent goal metrics report unknown, not clear", () => {
    const s = sig({
      goals: { enabled: false, total: 0, ok: 0, violated: [], flapped24h: [], lastRunAgeSeconds: null },
    });
    expect(isAllClear(s)).toBe(false);
    expect(verdict(s)).toBe("unknown");
    expect(problems(s)[0].kind).toBe("goal-unknown");
  });

  it("unreadable Docker is a problem, not an empty fleet", () => {
    const s = sig({ containers: { ok: false, containers: [], reason: "docker socket unreachable" } });
    expect(problems(s)).toEqual([
      { kind: "container", severity: "down", title: "Container status unknown", detail: "docker socket unreachable" },
    ]);
    expect(verdict(s)).toBe("problems");
  });

  it("real problems outrank unknowns in the verdict", () => {
    const s = sig({
      goals: { enabled: false, total: 0, ok: 0, violated: [], flapped24h: [], lastRunAgeSeconds: null },
      delivery: { subscriptions: 0, lastDeliveredAt: null },
    });
    expect(verdict(s)).toBe("problems");
  });
});

describe("containers", () => {
  it("calls out a container that is down", () => {
    const s = sig({ containers: { ok: true, containers: [{ name: "n8n", label: "n8n", up: false, state: "exited", status: "Exited (1) 2h ago" }] } });
    expect(problems(s)[0]).toMatchObject({ kind: "container", severity: "down", title: "n8n" });
  });

  it("calls out a running-but-unhealthy container", () => {
    const s = sig({ containers: { ok: true, containers: [{ name: "flux", up: true, state: "running", status: "Up 3 weeks (unhealthy)" }] } });
    expect(problems(s)[0]).toMatchObject({ kind: "container", severity: "warn", title: "flux" });
  });

  it("says nothing about a healthy fleet", () => {
    const s = sig({ containers: { ok: true, containers: [
      { name: "a", up: true, state: "running", status: "Up 1 day (healthy)" },
      { name: "b", up: true, state: "running", status: "Up 2 days" },
    ] } });
    expect(problems(s)).toEqual([]);
  });
});

describe("host thresholds warn, they do not dominate", () => {
  it("flags disk, memory and cpu over their thresholds", () => {
    const s = sig({ host: { ...GREEN.host, diskPct: HOST_WARN.diskPct, memPct: 95, cpuPct: 99 } });
    expect(problems(s).map((p) => p.title)).toEqual(["disk at 90%", "memory at 95%", "cpu at 99%"]);
  });

  it("is quiet just under the threshold", () => {
    expect(problems(sig({ host: { ...GREEN.host, diskPct: HOST_WARN.diskPct - 0.5 } }))).toEqual([]);
  });

  it("says nothing when host metrics are unavailable", () => {
    expect(problems(sig({ host: { ...GREEN.host, enabled: false, diskPct: 99 } }))).toEqual([]);
  });
});

describe("delivery health is health", () => {
  it("zero subscriptions is a problem, not a quiet default", () => {
    // sendPushToAll returns attempted:0 with no subs and looks successful.
    // That is how six weeks of dark delivery went unnoticed.
    const s = sig({ delivery: { subscriptions: 0, lastDeliveredAt: null } });
    expect(problems(s)).toEqual([{
      kind: "delivery", severity: "down",
      title: "Push delivery reaches nobody",
      detail: "no push subscriptions — alerts generate but are not delivered.",
    }]);
    expect(isAllClear(s)).toBe(false);
  });

  it("is quiet once something is subscribed", () => {
    expect(problems(sig({ delivery: { subscriptions: 1, lastDeliveredAt: null } }))).toEqual([]);
  });
});
