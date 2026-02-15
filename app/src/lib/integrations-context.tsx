"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useAuth } from "./auth-context";

interface GCalState {
  connected: boolean;
  accessToken: string | null;
  email: string | null;
  loading: boolean;
}

interface IntegrationsContextType {
  gcal: GCalState;
  connectGoogleCalendar: () => Promise<void>;
  disconnectGoogleCalendar: () => Promise<void>;
  createCalendarEvent: (event: {
    title: string;
    start: Date;
    end: Date;
    description?: string;
  }) => Promise<boolean>;
}

const IntegrationsContext = createContext<IntegrationsContextType>({
  gcal: { connected: false, accessToken: null, email: null, loading: true },
  connectGoogleCalendar: async () => {},
  disconnectGoogleCalendar: async () => {},
  createCalendarEvent: async () => false,
});

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [gcal, setGcal] = useState<GCalState>({
    connected: false,
    accessToken: null,
    email: null,
    loading: true,
  });


  // Load saved connection state from Firestore and handle Calendar OAuth redirect
  useEffect(() => {
    if (!user || !db) {
      setGcal((prev) => ({ ...prev, loading: false }));
      return;
    }

    const load = async () => {
      // Check if we're returning from a Google Calendar OAuth redirect
      if (auth) {
        try {
          const result = await getRedirectResult(auth);
          if (result) {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken ?? null;

            if (token) {
              const ref = doc(db!, "users", user.uid, "settings", "integrations");
              await setDoc(
                ref,
                {
                  gcal_connected: true,
                  gcal_email: result.user.email,
                  gcal_connected_at: new Date().toISOString(),
                },
                { merge: true }
              );

              setGcal({
                connected: true,
                accessToken: token,
                email: result.user.email,
                loading: false,
              });
              return;
            }
          }
        } catch {
          // Redirect result errors are non-fatal
        }
      }

      const ref = doc(db!, "users", user.uid, "settings", "integrations");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setGcal((prev) => ({
          connected: data.gcal_connected ?? false,
          accessToken: prev.accessToken,
          email: data.gcal_email ?? null,
          loading: false,
        }));
      } else {
        setGcal((prev) => ({ ...prev, loading: false }));
      }
    };

    load();
  }, [user]);

  const connectGoogleCalendar = useCallback(async () => {
    if (!auth || !user || !db) return;

    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar");
    provider.addScope("https://www.googleapis.com/auth/calendar.events");

    await signInWithRedirect(auth, provider);
  }, [user]);

  const disconnectGoogleCalendar = useCallback(async () => {
    if (!db || !user) return;

    const ref = doc(db, "users", user.uid, "settings", "integrations");
    await setDoc(
      ref,
      {
        gcal_connected: false,
        gcal_email: null,
        gcal_connected_at: null,
      },
      { merge: true }
    );

    setGcal({
      connected: false,
      accessToken: null,
      email: null,
      loading: false,
    });
  }, [user]);

  const createCalendarEvent = useCallback(
    async (event: {
      title: string;
      start: Date;
      end: Date;
      description?: string;
    }) => {
      if (!gcal.accessToken) return false;

      try {
        const resp = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${gcal.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              summary: event.title,
              description: event.description || "",
              start: { dateTime: event.start.toISOString() },
              end: { dateTime: event.end.toISOString() },
            }),
          }
        );
        return resp.ok;
      } catch {
        return false;
      }
    },
    [gcal.accessToken]
  );

  return (
    <IntegrationsContext.Provider
      value={{
        gcal,
        connectGoogleCalendar,
        disconnectGoogleCalendar,
        createCalendarEvent,
      }}
    >
      {children}
    </IntegrationsContext.Provider>
  );
}

export const useIntegrations = () => useContext(IntegrationsContext);
