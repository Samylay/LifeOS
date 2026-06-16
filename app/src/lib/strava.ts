// Server-side Strava OAuth token management.
//
// Strava refresh tokens rotate on every refresh. We persist the latest one
// to a JSON file next to the SQLite DB so it survives restarts, seeded from
// STRAVA_REFRESH_TOKEN if no file exists yet.
import path from "node:path";
import fs from "node:fs";

function dataDir(): string {
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tokenFile(): string {
  return path.join(dataDir(), "strava-token.json");
}

function readJsonFile<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(p: string, obj: unknown): void {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

interface PersistedToken {
  refresh_token?: string;
}

let cachedAccess: { token: string; exp: number } | null = null;

export function isStravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

/**
 * Returns a valid access token, refreshing (and persisting the rotated
 * refresh token) as needed. Returns null if Strava isn't configured or the
 * refresh fails.
 */
export async function stravaToken(): Promise<string | null> {
  const id = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedAccess && Date.now() < cachedAccess.exp - 60_000) {
    return cachedAccess.token;
  }

  const persisted = readJsonFile<PersistedToken>(tokenFile(), {});
  const refresh = persisted.refresh_token || process.env.STRAVA_REFRESH_TOKEN;
  if (!refresh) return null;

  let r: Response;
  try {
    r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: id,
        client_secret: secret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;

  const t = (await r.json()) as {
    access_token: string;
    expires_at: number;
    refresh_token?: string;
  };
  cachedAccess = { token: t.access_token, exp: t.expires_at * 1000 };
  if (t.refresh_token) {
    writeJsonAtomic(tokenFile(), { refresh_token: t.refresh_token });
  }
  return cachedAccess.token;
}

/** Authenticated GET against the Strava v3 API. Returns null on failure. */
export async function strava<T = unknown>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T | null> {
  const token = await stravaToken();
  if (!token) return null;

  const url = new URL(`https://www.strava.com/api/v3${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  let r: Response;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  return (await r.json()) as T;
}
