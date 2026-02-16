// Server-side only — Garmin Connect client wrapper
// Used by API routes to authenticate and fetch data from Garmin

import { GarminConnect } from "garmin-connect";
import type {
  GarminActivity,
  GarminSleepData,
  GarminHeartRate,
} from "./types";

let client: GarminConnect | null = null;
let isAuthenticated = false;
let connectedDisplayName: string | null = null;

export async function connectGarmin(
  email: string,
  password: string
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    client = new GarminConnect({ username: email, password });
    await client.login(email, password);

    // Try to get display name from user profile
    try {
      const profile = await client.getUserProfile();
      connectedDisplayName = profile?.fullName || profile?.displayName || email;
    } catch {
      connectedDisplayName = email;
    }

    isAuthenticated = true;
    return { success: true, displayName: connectedDisplayName };
  } catch (err: unknown) {
    client = null;
    isAuthenticated = false;
    connectedDisplayName = null;
    const message =
      err instanceof Error ? err.message : "Failed to connect to Garmin";
    return { success: false, error: message };
  }
}

export function disconnectGarmin(): void {
  client = null;
  isAuthenticated = false;
  connectedDisplayName = null;
}

export function getGarminStatus(): {
  connected: boolean;
  displayName: string | null;
} {
  return { connected: isAuthenticated, displayName: connectedDisplayName };
}

export async function fetchActivities(
  start = 0,
  limit = 20
): Promise<GarminActivity[]> {
  if (!client || !isAuthenticated) {
    throw new Error("Not connected to Garmin");
  }

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
  date?: Date
): Promise<number> {
  if (!client || !isAuthenticated) {
    throw new Error("Not connected to Garmin");
  }
  return client.getSteps(date);
}

export async function fetchSleepData(
  date?: Date
): Promise<GarminSleepData | null> {
  if (!client || !isAuthenticated) {
    throw new Error("Not connected to Garmin");
  }

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
  date?: Date
): Promise<GarminHeartRate | null> {
  if (!client || !isAuthenticated) {
    throw new Error("Not connected to Garmin");
  }

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
