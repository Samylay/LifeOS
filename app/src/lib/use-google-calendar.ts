"use client";

import { useState, useEffect, useCallback } from "react";
import { useIntegrations } from "./integrations-context";

export interface GCalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}

export function useGoogleCalendar() {
  const { gcal } = useIntegrations();
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      if (res.status === 401) {
        setError("token_expired");
      } else {
        setError("Failed to fetch calendar events");
      }
      setLoading(false);
      return;
    }

    const data = await res.json();
    const mapped: GCalEvent[] = (data.items ?? [])
      .filter((item: Record<string, unknown>) => item.status !== "cancelled")
      .map((item: Record<string, unknown>) => {
        const startObj = item.start as Record<string, string> | undefined;
        const endObj = item.end as Record<string, string> | undefined;
        const allDay = Boolean(startObj?.date);
        return {
          id: item.id as string,
          title: (item.summary as string) || "(No title)",
          start: new Date(startObj?.dateTime ?? startObj?.date ?? ""),
          end: new Date(endObj?.dateTime ?? endObj?.date ?? ""),
          allDay,
          location: item.location as string | undefined,
          description: item.description as string | undefined,
        };
      });

    setEvents(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (gcal.accessToken) {
      fetchEvents(gcal.accessToken);
    } else {
      setEvents([]);
    }
  }, [gcal.accessToken, fetchEvents]);

  return {
    events,
    loading,
    error,
    hasToken: Boolean(gcal.accessToken),
    connected: gcal.connected,
  };
}
