"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "./auth-context";
import { auth } from "./firebase";
import type {
  GarminActivity,
  GarminDailySummary,
  GarminConnectionState,
} from "./types";

/** Get a fresh Firebase ID token for authenticated API calls */
async function getIdToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/** Wrapper around fetch that injects the Firebase Authorization header */
async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getIdToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export function useGarmin() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<GarminConnectionState>({
    connected: false,
    displayName: null,
    lastSyncedAt: null,
  });
  const [activities, setActivities] = useState<GarminActivity[]>([]);
  const [dailySummary, setDailySummary] = useState<GarminDailySummary | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status on mount (only when authenticated)
  useEffect(() => {
    if (!user) {
      setConnection({ connected: false, displayName: null, lastSyncedAt: null });
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await authFetch("/api/garmin/status");
        if (res.ok) {
          const data = await res.json();
          setConnection((prev) => ({
            ...prev,
            connected: data.connected,
            displayName: data.displayName,
          }));
        }
      } catch {
        // Server not reachable or not authenticated — leave as disconnected
      }
    };
    checkStatus();
  }, [user]);

  const connect = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch("/api/garmin/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Connection failed");
          return false;
        }

        setConnection({
          connected: true,
          displayName: data.displayName,
          lastSyncedAt: null,
        });
        return true;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Connection failed";
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const disconnect = useCallback(async () => {
    try {
      await authFetch("/api/garmin/disconnect", { method: "POST" });
    } catch {
      // best effort
    }
    setConnection({
      connected: false,
      displayName: null,
      lastSyncedAt: null,
    });
    setActivities([]);
    setDailySummary(null);
    setError(null);
  }, []);

  const syncActivities = useCallback(
    async (start = 0, limit = 20) => {
      if (!connection.connected) return;
      setSyncing(true);
      setError(null);
      try {
        const res = await authFetch(
          `/api/garmin/activities?start=${start}&limit=${limit}`
        );
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401) {
            setConnection((prev) => ({ ...prev, connected: false }));
          }
          setError(data.error || "Failed to fetch activities");
          return;
        }

        setActivities(data.activities || []);
        setConnection((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch activities";
        setError(msg);
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
        const url = date
          ? `/api/garmin/health?date=${date}`
          : "/api/garmin/health";
        const res = await authFetch(url);
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401) {
            setConnection((prev) => ({ ...prev, connected: false }));
          }
          setError(data.error || "Failed to fetch health data");
          return;
        }

        setDailySummary(data);
        setConnection((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch health data";
        setError(msg);
      } finally {
        setSyncing(false);
      }
    },
    [connection.connected]
  );

  const syncAll = useCallback(
    async (date?: string) => {
      await Promise.all([syncActivities(0, 10), syncHealth(date)]);
    },
    [syncActivities, syncHealth]
  );

  return {
    connection,
    activities,
    dailySummary,
    loading,
    syncing,
    error,
    connect,
    disconnect,
    syncActivities,
    syncHealth,
    syncAll,
  };
}
