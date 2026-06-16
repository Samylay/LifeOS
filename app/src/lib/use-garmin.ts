"use client";

// Garmin sync is disabled in the self-hosted build — no external calls. This
// stub preserves the hook's shape so the workouts/health/settings pages keep
// compiling and just show a disconnected, empty state.
import type {
  GarminActivity,
  GarminDailySummary,
  GarminConnectionState,
} from "./types";

export function useGarmin() {
  const connection: GarminConnectionState = {
    connected: false,
    displayName: null,
    lastSyncedAt: null,
  };

  return {
    connection,
    activities: [] as GarminActivity[],
    dailySummary: null as GarminDailySummary | null,
    loading: false,
    syncing: false,
    error: null as string | null,
    connect: async (_email: string, _password: string): Promise<boolean> => false,
    disconnect: async (): Promise<void> => {},
    syncActivities: async (_start?: number, _limit?: number): Promise<void> => {},
    syncHealth: async (_date?: string): Promise<void> => {},
    syncAll: async (_date?: string): Promise<void> => {},
  };
}
