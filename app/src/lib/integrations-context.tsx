"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
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
}

const IntegrationsContext = createContext<IntegrationsContextType>({
  gcal: { connected: false, accessToken: null, email: null, loading: true },
  connectGoogleCalendar: async () => {},
  disconnectGoogleCalendar: async () => {},
});

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [gcal, setGcal] = useState<GCalState>({
    connected: false,
    accessToken: null,
    email: null,
    loading: true,
  });

  // Load saved connection state from Firestore
  useEffect(() => {
    if (!user || !db) {
      setGcal((prev) => ({ ...prev, loading: false }));
      return;
    }

    const load = async () => {
      const ref = doc(db!, "users", user.uid, "settings", "integrations");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setGcal({
          connected: data.gcal_connected ?? false,
          accessToken: null, // Token doesn't persist — user re-authenticates per session
          email: data.gcal_email ?? null,
          loading: false,
        });
      } else {
        setGcal((prev) => ({ ...prev, loading: false }));
      }
    };

    load();
  }, [user]);

  const connectGoogleCalendar = useCallback(async () => {
    if (!auth || !db || !user) return;

    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken ?? null;

    // Save connection flag to Firestore
    const ref = doc(db, "users", user.uid, "settings", "integrations");
    await setDoc(ref, {
      gcal_connected: true,
      gcal_email: result.user.email,
      gcal_connected_at: new Date().toISOString(),
    }, { merge: true });

    setGcal({
      connected: true,
      accessToken: token,
      email: result.user.email,
      loading: false,
    });
  }, [user]);

  const disconnectGoogleCalendar = useCallback(async () => {
    if (!db || !user) return;

    const ref = doc(db, "users", user.uid, "settings", "integrations");
    await setDoc(ref, {
      gcal_connected: false,
      gcal_email: null,
      gcal_connected_at: null,
    }, { merge: true });

    setGcal({
      connected: false,
      accessToken: null,
      email: null,
      loading: false,
    });
  }, [user]);

  return (
    <IntegrationsContext.Provider
      value={{ gcal, connectGoogleCalendar, disconnectGoogleCalendar }}
    >
      {children}
    </IntegrationsContext.Provider>
  );
}

export const useIntegrations = () => useContext(IntegrationsContext);
