// Server-side only — Garmin Connect client wrapper
// Per-user client instances keyed by Firebase UID

import { GarminConnect } from "garmin-connect";
import type {
  GarminActivity,
  GarminSleepData,
  GarminHeartRate,
} from "./types";

interface UserGarminSession {
  client: GarminConnect;
  displayName: string | null;
}

/** Per-user Garmin sessions keyed by Firebase UID */
const sessions = new Map<string, UserGarminSession>();

export async function connectGarmin(
  userId: string,
  email: string,
  password: string
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    const client = new GarminConnect({ username: email, password });
    await client.login(email, password);

    let displayName: string | null = email;
    try {
      const profile = await client.getUserProfile();
      displayName = profile?.fullName || profile?.displayName || email;
    } catch {
      // Profile fetch failed — fall back to email
    }

    sessions.set(userId, { client, displayName });
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
}

export function getGarminStatus(userId: string): {
  connected: boolean;
  displayName: string | null;
} {
  const session = sessions.get(userId);
  if (!session) return { connected: false, displayName: null };
  return { connected: true, displayName: session.displayName };
}

function getClient(userId: string): GarminConnect {
  const session = sessions.get(userId);
  if (!session) throw new Error("Not connected to Garmin");
  return session.client;
}

export async function fetchActivities(
  userId: string,
  start = 0,
  limit = 20
): Promise<GarminActivity[]> {
  const client = getClient(userId);
  const activities = await client.getActivities(start, limit);

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
  const client = getClient(userId);
  return client.getSteps(date);
}

export async function fetchSleepData(
  userId: string,
  date?: Date
): Promise<GarminSleepData | null> {
  const client = getClient(userId);

  try {
    const sleep = await client.getSleepData(date);
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
  const client = getClient(userId);

  try {
    const hr = await client.getHeartRate(date);
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
