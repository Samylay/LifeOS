"use client";

// Garmin Connect client hook for the single-user self-hosted build. The
// server routes (/api/garmin/*) treat every request as the local user
// (verify-auth), so no tokens are involved client-side. Server-side the OAuth
// tokens are persisted under the data volume, so the connection now survives
// an app restart and one login lasts until Garmin expires the token.
import { useState, useCallback, useEffect } from "react";
import type {
  GarminActivity,
  GarminDailySummary,
  GarminDailyNutrition,
  GarminWeighIn,
  GarminConnectionState,
} from "./types";

export function useGarmin() {
  const [connection, setConnection] = useState<GarminConnectionState>({
    connected: false,
    displayName: null,
    lastSyncedAt: null,
  });
  const [activities, setActivities] = useState<GarminActivity[]>([]);
  const [dailySummary, setDailySummary] = useState<GarminDailySummary | null>(null);
  const [nutrition, setNutrition] = useState<GarminDailyNutrition | null>(null);
  const [weighIn, setWeighIn] = useState<GarminWeighIn | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/garmin/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setConnection((prev) => ({
          ...prev,
          connected: data.connected,
          displayName: data.displayName,
        }));
      } catch {
        // Server not reachable — leave as disconnected.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/garmin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Connection failed");
        return false;
      }
      setConnection({ connected: true, displayName: data.displayName, lastSyncedAt: null });
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/garmin/disconnect", { method: "POST" });
    } catch {
      // best effort
    }
    setConnection({ connected: false, displayName: null, lastSyncedAt: null });
    setActivities([]);
    setDailySummary(null);
    setNutrition(null);
    setWeighIn(null);
    setError(null);
  }, []);

  const syncActivities = useCallback(
    async (start = 0, limit = 20) => {
      if (!connection.connected) return;
      setSyncing(true);
      setError(null);
      try {
        const res = await fetch(`/api/garmin/activities?start=${start}&limit=${limit}`);
        const data = await res.json();
        if (!res.ok) {
          // 401 = the persisted Garmin token was rejected (revoked or expired
          // past what OAuth1 can refresh), so a real re-login is needed.
          if (res.status === 401) setConnection((prev) => ({ ...prev, connected: false }));
          setError(data.error || "Failed to fetch activities");
          return;
        }
        setActivities(data.activities || []);
        setConnection((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to fetch activities");
      } finally {
        setSyncing(false);
      }
    },
    [connection.connected]
  );

  const syncHealth = useCallback(
    async (date?: string) => {
      if (!connection.connected) return;
      setSyncing(true);
      setError(null);
      try {
        const res = await fetch(date ? `/api/garmin/health?date=${date}` : "/api/garmin/health");
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) setConnection((prev) => ({ ...prev, connected: false }));
          setError(data.error || "Failed to fetch health data");
          return;
        }
        setDailySummary(data);
        setConnection((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to fetch health data");
      } finally {
        setSyncing(false);
      }
    },
    [connection.connected]
  );

  // Calories in (logged in MyFitnessPal, synced to Garmin) plus the day's
  // weigh-in. Both stay null when nothing was logged, which is a normal day
  // rather than an error — the UI must not render that as a zero.
  const syncNutrition = useCallback(
    async (date?: string) => {
      if (!connection.connected) return;
      setSyncing(true);
      setError(null);
      try {
        const res = await fetch(
          date ? `/api/garmin/nutrition?date=${date}` : "/api/garmin/nutrition"
        );
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) setConnection((prev) => ({ ...prev, connected: false }));
          setError(data.error || "Failed to fetch nutrition");
          return;
        }
        setNutrition(data.nutrition ?? null);
        setWeighIn(data.weighIn ?? null);
        setConnection((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to fetch nutrition");
      } finally {
        setSyncing(false);
      }
    },
    [connection.connected]
  );

  const syncAll = useCallback(
    async (date?: string) => {
      await Promise.all([syncActivities(0, 10), syncHealth(date), syncNutrition(date)]);
    },
    [syncActivities, syncHealth, syncNutrition]
  );

  return {
    connection,
    activities,
    dailySummary,
    nutrition,
    weighIn,
    loading,
    syncing,
    error,
    connect,
    disconnect,
    syncActivities,
    syncHealth,
    syncNutrition,
    syncAll,
  };
}
