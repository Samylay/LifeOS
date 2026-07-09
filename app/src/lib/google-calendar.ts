// Server-side Google Calendar OAuth token management + minimal REST wrapper,
// for T23's calendar read + tentative-block writer (see
// ~/loop-me/workflows/daily-planning.md "Calendar behavior"). Mirrors
// strava.ts's refresh-token pattern; unlike Strava, Google refresh tokens
// don't rotate on refresh, so no persisted-token file is needed.
import { BRIEF_TZ, localTimeToUtcIso } from "./brief/tz";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

let cachedAccess: { token: string; exp: number } | null = null;

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  );
}

async function googleCalendarToken(): Promise<string | null> {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;

  if (cachedAccess && Date.now() < cachedAccess.exp - 60_000) {
    return cachedAccess.token;
  }

  let r: Response;
  try {
    r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;

  const t = (await r.json()) as { access_token: string; expires_in: number };
  cachedAccess = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return cachedAccess.token;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
}

/**
 * Existing events for the local calendar day [`dateStr` 00:00, +1d) in `tz`.
 * All-day events (no `dateTime`) are skipped — they aren't timed conflicts.
 * Returns null on auth/fetch failure so callers can distinguish "no events"
 * from "couldn't read the calendar".
 */
export async function listEventsForDay(
  dateStr: string,
  tz: string = BRIEF_TZ
): Promise<CalendarEvent[] | null> {
  const token = await googleCalendarToken();
  if (!token) return null;

  const timeMin = localTimeToUtcIso(dateStr, 0, 0, tz);
  const nextDay = new Date(Date.parse(`${dateStr}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const timeMax = localTimeToUtcIso(nextDay, 0, 0, tz);

  const url = new URL(EVENTS_URL);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;

  const body = (await r.json()) as {
    items?: {
      id: string;
      summary?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    }[];
  };
  return (body.items ?? [])
    .filter((e) => e.start.dateTime && e.end.dateTime)
    .map((e) => ({ id: e.id, summary: e.summary ?? "", startIso: e.start.dateTime!, endIso: e.end.dateTime! }));
}

/** Moves an existing event to a new start/end. Returns true on success. */
export async function patchEventTime(
  eventId: string,
  startIso: string,
  endIso: string
): Promise<boolean> {
  const token = await googleCalendarToken();
  if (!token) return false;
  try {
    const r = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ start: { dateTime: startIso }, end: { dateTime: endIso } }),
      signal: AbortSignal.timeout(20_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Deletes an event from the primary calendar. Returns true on success. */
export async function deleteEvent(eventId: string): Promise<boolean> {
  const token = await googleCalendarToken();
  if (!token) return false;
  try {
    const r = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    return r.ok || r.status === 410; // already gone counts as deleted
  } catch {
    return false;
  }
}

/** Inserts a timed event on the primary calendar. Returns the created event's id, or null on failure. */
export async function insertTentativeEvent(
  summary: string,
  startIso: string,
  endIso: string
): Promise<string | null> {
  const token = await googleCalendarToken();
  if (!token) return null;

  let r: Response;
  try {
    r = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
        transparency: "transparent",
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const created = (await r.json()) as { id: string };
  return created.id;
}
