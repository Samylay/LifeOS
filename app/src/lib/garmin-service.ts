// Server-side only — Garmin Connect client wrapper.
//
// The session is PERSISTED, not just held in memory. Garmin's auth is a
// long-lived OAuth1 token plus a short-lived OAuth2 token that the library
// re-derives from the OAuth1 one; both live in `<dataDir>/garmin/`, so a
// container restart no longer forces a fresh email+password login (which is
// what it used to do — the sessions Map below was the only copy).
//
// The password is never written to disk. Only the two OAuth token files and a
// small session.json (username + display name + profile id) are stored.

import fs from "node:fs";
import path from "node:path";
import { GarminConnect } from "garmin-connect";
import { dataDir } from "./data-dir";
import type {
  GarminActivity,
  GarminSleepData,
  GarminHeartRate,
  GarminDailyNutrition,
  GarminWeighIn,
} from "./types";

interface UserGarminSession {
  client: GarminConnect;
  displayName: string | null;
  /** Garmin's internal profile id, needed by the daily-summary endpoint. */
  profileId: string | null;
}

interface PersistedSession {
  username: string;
  displayName: string | null;
  profileId: string | null;
}

/** In-process cache. The durable copy is on disk (see tokenDir). */
const sessions = new Map<string, UserGarminSession>();

function tokenDir(userId: string): string {
  // userId is always the local single user, but key by it anyway so a second
  // account cannot silently overwrite the first one's tokens.
  return path.join(dataDir(), "garmin", encodeURIComponent(userId));
}

function sessionFile(userId: string): string {
  return path.join(tokenDir(userId), "session.json");
}

function oauth2File(userId: string): string {
  return path.join(tokenDir(userId), "oauth2_token.json");
}

function hasPersistedTokens(userId: string): boolean {
  return (
    fs.existsSync(path.join(tokenDir(userId), "oauth1_token.json")) &&
    fs.existsSync(oauth2File(userId))
  );
}

function readPersistedSession(userId: string): PersistedSession | null {
  try {
    return JSON.parse(
      fs.readFileSync(sessionFile(userId), "utf8")
    ) as PersistedSession;
  } catch {
    return null;
  }
}

function writePersistedSession(userId: string, s: PersistedSession): void {
  fs.mkdirSync(tokenDir(userId), { recursive: true });
  const tmp = `${sessionFile(userId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, sessionFile(userId));
}

/** Snapshot of the on-disk OAuth2 expiry, used to detect a library refresh. */
function persistedOauth2Expiry(userId: string): number | null {
  try {
    const t = JSON.parse(fs.readFileSync(oauth2File(userId), "utf8")) as {
      expires_at?: number;
    };
    return t.expires_at ?? null;
  } catch {
    return null;
  }
}

/**
 * The library refreshes the OAuth2 token in memory when it expires. Without
 * this, that refreshed token dies with the process and the next restart falls
 * back to a stale one, so re-export whenever the expiry has moved.
 */
function persistIfRefreshed(userId: string, client: GarminConnect): void {
  try {
    const live = client.exportToken();
    if (live.oauth2?.expires_at === persistedOauth2Expiry(userId)) return;
    client.exportTokenToFile(tokenDir(userId));
  } catch {
    // Token not ready (never logged in) — nothing to persist.
  }
}

export async function connectGarmin(
  userId: string,
  email: string,
  password: string
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    const client = new GarminConnect({ username: email, password });
    await client.login(email, password);

    let displayName: string | null = email;
    let profileId: string | null = null;
    try {
      const profile = await client.getUserProfile();
      displayName = profile?.fullName || profile?.displayName || email;
      profileId = profile?.displayName ?? null;
    } catch {
      // Profile fetch failed — fall back to email
    }

    sessions.set(userId, { client, displayName, profileId });

    // Persist so the next restart restores instead of prompting.
    client.exportTokenToFile(tokenDir(userId));
    writePersistedSession(userId, { username: email, displayName, profileId });

    return { success: true, displayName: displayName ?? undefined };
  } catch (err: unknown) {
    // Clean up on failure
    sessions.delete(userId);
    const message =
      err instanceof Error ? err.message : "Failed to connect to Garmin";
    return { success: false, error: message };
  }
}

export function disconnectGarmin(userId: string): void {
  sessions.delete(userId);
  fs.rmSync(tokenDir(userId), { recursive: true, force: true });
}

export function getGarminStatus(userId: string): {
  connected: boolean;
  displayName: string | null;
} {
  const session = sessions.get(userId) ?? restoreSession(userId);
  if (!session) return { connected: false, displayName: null };
  return { connected: true, displayName: session.displayName };
}

/**
 * Rebuilds a client from the persisted tokens. No network call and no
 * password: the OAuth1 token alone is enough for the library to mint a fresh
 * OAuth2 token on the next request.
 */
function restoreSession(userId: string): UserGarminSession | null {
  if (!hasPersistedTokens(userId)) return null;
  const persisted = readPersistedSession(userId);
  try {
    const client = new GarminConnect({
      username: persisted?.username ?? "",
      password: "",
    });
    client.loadTokenByFile(tokenDir(userId));
    const session: UserGarminSession = {
      client,
      displayName: persisted?.displayName ?? persisted?.username ?? null,
      profileId: persisted?.profileId ?? null,
    };
    sessions.set(userId, session);
    return session;
  } catch {
    return null;
  }
}

function getSession(userId: string): UserGarminSession {
  const session = sessions.get(userId) ?? restoreSession(userId);
  if (!session) throw new Error("Not connected to Garmin");
  return session;
}

function getClient(userId: string): GarminConnect {
  return getSession(userId).client;
}

/**
 * Runs a call against the restored client, then writes back any OAuth2 token
 * the library refreshed mid-request. Every Garmin read goes through this so
 * the persisted session stays current without a scheduled refresh job.
 */
async function withClient<T>(
  userId: string,
  fn: (client: GarminConnect) => Promise<T>
): Promise<T> {
  const client = getClient(userId);
  try {
    return await fn(client);
  } finally {
    persistIfRefreshed(userId, client);
  }
}

export async function fetchActivities(
  userId: string,
  start = 0,
  limit = 20
): Promise<GarminActivity[]> {
  const activities = await withClient(userId, (c) =>
    c.getActivities(start, limit)
  );

  return activities.map((a) => ({
    activityId: a.activityId,
    activityName: a.activityName || "Unnamed Activity",
    activityType: a.activityType?.typeKey || "unknown",
    startTimeLocal: a.startTimeLocal,
    duration: a.duration || 0,
    distance: a.distance || 0,
    calories: a.calories || 0,
    averageHR: a.averageHR || 0,
    maxHR: a.maxHR || 0,
    elevationGain: a.elevationGain || 0,
    steps: a.steps || 0,
    vO2MaxValue: a.vO2MaxValue || 0,
    averageSpeed: a.averageSpeed || 0,
  }));
}

export async function fetchSteps(
  userId: string,
  date?: Date
): Promise<number> {
  return withClient(userId, (c) => c.getSteps(date));
}

export async function fetchSleepData(
  userId: string,
  date?: Date
): Promise<GarminSleepData | null> {
  try {
    const sleep = await withClient(userId, (c) => c.getSleepData(date));
    if (!sleep?.dailySleepDTO) return null;

    const dto = sleep.dailySleepDTO;
    return {
      calendarDate: dto.calendarDate,
      sleepTimeSeconds: dto.sleepTimeSeconds || 0,
      deepSleepSeconds: dto.deepSleepSeconds || 0,
      lightSleepSeconds: dto.lightSleepSeconds || 0,
      remSleepSeconds: dto.remSleepSeconds || 0,
      awakeSleepSeconds: dto.awakeSleepSeconds || 0,
      sleepScore: dto.sleepScores?.overall?.value || 0,
      restingHeartRate: sleep.restingHeartRate || 0,
      avgOvernightHrv: sleep.avgOvernightHrv || 0,
      hrvStatus: sleep.hrvStatus || "unknown",
      bodyBatteryChange: sleep.bodyBatteryChange || 0,
      averageRespirationValue: dto.averageRespirationValue || 0,
    };
  } catch {
    return null;
  }
}

export async function fetchHeartRate(
  userId: string,
  date?: Date
): Promise<GarminHeartRate | null> {
  try {
    const hr = await withClient(userId, (c) => c.getHeartRate(date));
    if (!hr) return null;

    return {
      calendarDate: hr.calendarDate,
      maxHeartRate: hr.maxHeartRate || 0,
      minHeartRate: hr.minHeartRate || 0,
      restingHeartRate: hr.restingHeartRate || 0,
      lastSevenDaysAvgRestingHeartRate: hr.lastSevenDaysAvgRestingHeartRate || 0,
    };
  } catch {
    return null;
  }
}

// --- Nutrition (MyFitnessPal → Garmin) --------------------------------------
//
// MyFitnessPal has no open API: its developer programme has been shut to new
// applicants for years, so there is no OAuth flow to build against. What does
// exist is MFP's own sync into Garmin Connect, which pushes the day's consumed
// calories onto the Garmin daily summary. Reading it from there means LifeOS
// never handles MFP credentials and never depends on a reverse-engineered
// client. If the numbers below stay null, the MFP↔Garmin link is off in the
// MyFitnessPal app, not broken here.

const DAILY_SUMMARY_URL =
  "https://connectapi.garmin.com/usersummary-service/usersummary/daily";

/** Garmin's daily summary, only the fields the eating plan needs. */
interface RawDailySummary {
  calendarDate?: string;
  totalKilocalories?: number | null;
  activeKilocalories?: number | null;
  bmrKilocalories?: number | null;
  consumedKilocalories?: number | null;
  remainingKilocalories?: number | null;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Calories in (from MyFitnessPal) and out (from Garmin) for one day.
 * `consumedKcal` is null when nothing was logged in MFP that day, which is the
 * expected state on days Samy does not log — treat it as "no data", never 0.
 */
export async function fetchDailyNutrition(
  userId: string,
  date: Date = new Date()
): Promise<GarminDailyNutrition | null> {
  const session = getSession(userId);
  if (!session.profileId) return null;

  const dateString = toDateString(date);
  try {
    const raw = await withClient(userId, (c) =>
      c.get(`${DAILY_SUMMARY_URL}/${session.profileId}`, {
        params: { calendarDate: dateString },
      })
    ) as RawDailySummary | null;
    if (!raw) return null;

    const consumed = raw.consumedKilocalories ?? null;
    const burned = raw.totalKilocalories ?? null;
    return {
      calendarDate: raw.calendarDate || dateString,
      consumedKcal: consumed,
      burnedKcal: burned,
      activeKcal: raw.activeKilocalories ?? null,
      bmrKcal: raw.bmrKilocalories ?? null,
      netKcal: consumed != null && burned != null ? consumed - burned : null,
      loggedInMfp: consumed != null && consumed > 0,
    };
  } catch {
    return null;
  }
}

/**
 * Latest weigh-in for a day, in kg. Garmin stores grams; index weigh-ins sync
 * here automatically, manual ones are entered in the Garmin app.
 */
export async function fetchWeight(
  userId: string,
  date: Date = new Date()
): Promise<GarminWeighIn | null> {
  try {
    const data = await withClient(userId, (c) => c.getDailyWeightData(date));
    const grams = data?.totalAverage?.weight;
    if (typeof grams !== "number") return null;
    return {
      calendarDate: toDateString(date),
      weightKg: Math.round((grams / 1000) * 10) / 10,
    };
  } catch {
    // No weigh-in that day — the library throws rather than returning empty.
    return null;
  }
}
