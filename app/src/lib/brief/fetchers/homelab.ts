// Quorky health — exception-driven: the dot is the message.
//
// In-container port of the host fetcher. Sources adapted to what the lifeos
// container can reach: containers via the mounted docker socket
// (system-health.ts), host disk via Prometheus/node_exporter (metrics.ts),
// hermes heartbeat via the ro /hermes mount. "Tailnet reachable" is probed by
// hitting the n8n webhook origin, which listens ONLY on the host's tailscale
// IP — if tailscaled is down that IP is gone and the probe fails. Watch list
// lives in system-health.ts (single source, was duplicated on the host).

import fs from "node:fs";
import { getHealth } from "@/lib/system-health";
import { getHostMetrics } from "@/lib/metrics";
import { card, type FetchResult } from "../registry";

const HERMES_STATUS = process.env.HERMES_STATUS || "/hermes/status.json";
const HERMES_FAILURE_THRESHOLD = 3;
const DISK_AMBER_PCT = 75;
const DISK_RED_PCT = 90;
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434") + "/api/tags";

async function probeOk(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const r = await globalThis.fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    return r.status < 500;
  } catch {
    return false;
  }
}

function hermesIssue(): string | null {
  try {
    const state = JSON.parse(fs.readFileSync(HERMES_STATUS, "utf8"));
    const failures = state.consecutive_failures ?? 0;
    if (failures >= HERMES_FAILURE_THRESHOLD) {
      return `hermes: ${failures} consecutive enrichment failures`;
    }
  } catch {
    // unreadable heartbeat is not an issue by itself
  }
  return null;
}

export async function fetch(): Promise<FetchResult> {
  const issues: string[] = [];

  const [health, metrics] = await Promise.all([getHealth(), getHostMetrics()]);
  if (!health.ok) throw new Error(health.reason || "docker socket unreachable");

  const up = health.services.filter((s) => s.up);
  for (const s of health.services) {
    if (!s.up) issues.push(`container ${s.name} is not running (${s.state})`);
  }

  const diskPct = metrics.diskPct !== null ? Math.round(metrics.diskPct) : null;
  if (diskPct !== null && diskPct >= DISK_AMBER_PCT) issues.push(`disk / at ${diskPct}%`);

  // Tailnet probe: the n8n webhook origin only exists on the tailscale IP.
  const webhook = process.env.BRIEF_N8N_WEBHOOK || "";
  const tailscaleOk = webhook ? await probeOk(new URL(webhook).origin) : true;
  if (!tailscaleOk) issues.push("tailnet endpoint not reachable (tailscale or n8n down)");

  // Ollama is intentionally stopped (LLM default is `claude -p` since
  // 2026-06); only treat it as an issue if explicitly opted in.
  const ollamaOk = await probeOk(OLLAMA_URL);
  if (!ollamaOk && process.env.BRIEF_CHECK_OLLAMA === "1") {
    issues.push("ollama not responding (fallback LLM offline)");
  }

  const hermes = hermesIssue();
  if (hermes) issues.push(hermes);

  const down = health.services.length - up.length;
  let status: "green" | "amber" | "red";
  if (down > 0 || (diskPct !== null && diskPct >= DISK_RED_PCT) || !tailscaleOk) status = "red";
  else if (issues.length) status = "amber";
  else status = "green";

  const parts: string[] = [];
  if (down) parts.push(`${down} container${down > 1 ? "s" : ""} down`);
  parts.push(diskPct !== null ? `disk ${diskPct}%` : "disk n/a");
  const summary = issues.length ? parts.join(" · ") : "all good";

  return card({
    id: "homelab", type: "homelab", priority: "state", status,
    title: "Homelab",
    body: {
      summary,
      containers_up: up.length,
      containers_total: health.services.length,
      disk_pct: diskPct,
      tailscale_ok: tailscaleOk,
      ollama_ok: ollamaOk,
      issues,
    },
    link: "/status",
  });
}
