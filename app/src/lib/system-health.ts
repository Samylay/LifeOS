// Docker socket + hermes heartbeat readers, ported from lifeos-dash/api/server.js.
import http from "node:http";
import fs from "node:fs";

const DOCKER_SOCK = process.env.DOCKER_SOCK || "/var/run/docker.sock";
const HERMES_STATUS = process.env.HERMES_STATUS || "/hermes/status.json";

// Containers to surface on the cockpit (docker name -> friendly label).
const WATCH: Record<string, string> = {
  lifeos: "LifeOS app",
  "flux-app-1": "Flux",
  "flux-db-1": "Flux DB",
  "flux-nginx-1": "Flux web",
  n8n: "n8n",
  cloudflared: "Cloudflare tunnel",
  prometheus: "Prometheus",
  grafana: "Grafana",
  cadvisor: "cAdvisor",
  node_exporter: "node-exporter",
};

interface DockerContainer {
  Names?: string[];
  State?: string;
  Status?: string;
}

export interface ServiceStatus {
  name: string;
  label: string;
  up: boolean;
  state: string;
  status: string;
}

export interface HealthResult {
  ok: boolean;
  services: ServiceStatus[];
  reason?: string;
}

function dockerContainers(): Promise<DockerContainer[] | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(DOCKER_SOCK)) {
      resolve(null);
      return;
    }
    const req = http.request(
      {
        socketPath: DOCKER_SOCK,
        path: "/v1.41/containers/json?all=1",
        method: "GET",
      },
      (r) => {
        let buf = "";
        r.on("data", (c) => (buf += c));
        r.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

export async function getHealth(): Promise<HealthResult> {
  const containers = await dockerContainers();
  if (!containers) {
    return { ok: false, reason: "docker socket unreachable", services: [] };
  }
  const byName: Record<string, DockerContainer> = {};
  for (const c of containers) {
    const name = (c.Names && c.Names[0] ? c.Names[0] : "").replace(/^\//, "");
    byName[name] = c;
  }
  const services = Object.entries(WATCH).map(([name, label]) => {
    const c = byName[name];
    return {
      name,
      label,
      up: !!c && c.State === "running",
      state: c ? c.State ?? "unknown" : "absent",
      status: c ? c.Status ?? "" : "not found",
    };
  });
  return { ok: true, services };
}

interface HermesStatusFile {
  last_run?: string;
  last_file?: string;
  processed_count?: number;
}

export interface HermesResult {
  ok: boolean;
  reason?: string;
  lastRun?: string | null;
  lastFile?: string | null;
  processed?: number;
  ranToday?: boolean;
}

function readJsonFile<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export interface ContainerInfo {
  name: string;
  label?: string;
  up: boolean;
  state: string;
  status: string;
}

/** Every container on the host (not just the curated WATCH list) — for /status. */
export async function getAllContainers(): Promise<{
  ok: boolean;
  containers: ContainerInfo[];
  reason?: string;
}> {
  const containers = await dockerContainers();
  if (!containers) return { ok: false, containers: [], reason: "docker socket unreachable" };
  const list = containers
    .map((c) => {
      const name = (c.Names && c.Names[0] ? c.Names[0] : "").replace(/^\//, "");
      return {
        name,
        label: WATCH[name],
        up: c.State === "running",
        state: c.State ?? "unknown",
        status: c.Status ?? "",
      };
    })
    .filter((c) => c.name)
    .sort((a, b) => Number(b.up) - Number(a.up) || a.name.localeCompare(b.name));
  return { ok: true, containers: list };
}

export function getHermesStatus(): HermesResult {
  const s = readJsonFile<HermesStatusFile | null>(HERMES_STATUS, null);
  if (!s) return { ok: false, reason: "no heartbeat yet (restart hermes)" };
  const last = s.last_run ? new Date(s.last_run) : null;
  const today = new Date().toLocaleDateString("en-CA");
  const ranToday = !!(last && last.toLocaleDateString("en-CA") === today);
  return {
    ok: true,
    lastRun: s.last_run ?? null,
    lastFile: s.last_file ?? null,
    processed: s.processed_count ?? 0,
    ranToday,
  };
}
