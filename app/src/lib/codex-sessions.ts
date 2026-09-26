import { createHash } from "node:crypto";

export interface CodexSession {
  id: string;
  title: string;
  status: "starting" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  progress: string[];
  answer?: string;
  error?: string;
  notified: boolean;
}

async function request(path = "", body?: unknown) {
  const url = new URL(process.env.CODEX_BRIDGE_URL ?? "http://host.docker.internal:11435/generate");
  url.pathname = `/codex/sessions${path}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Codex session service is unavailable");
  return data;
}

export async function startCodexSession(title: string, prompt: string, requestId?: string): Promise<CodexSession> {
  const key = requestId ? createHash("sha256").update(requestId).digest("hex") : undefined;
  return request("", { title, prompt, requestId: key });
}

export async function getCodexSessions(id?: string): Promise<CodexSession[]> {
  if (id) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid Codex session id");
    return [await request(`/${id}`)];
  }
  return (await request()).sessions;
}
