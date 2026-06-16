"use client";

import { createContext, useContext, ReactNode } from "react";

// Cloud integrations (Google Calendar) are disabled in the self-hosted build —
// no external calls. This stub keeps the same surface so consumers compile and
// simply report a permanently-disconnected state.

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

const DISABLED: GCalState = {
  connected: false,
  accessToken: null,
  email: null,
  loading: false,
};

const IntegrationsContext = createContext<IntegrationsContextType>({
  gcal: DISABLED,
  connectGoogleCalendar: async () => {},
  disconnectGoogleCalendar: async () => {},
  createCalendarEvent: async () => false,
});

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  return (
    <IntegrationsContext.Provider
      value={{
        gcal: DISABLED,
        connectGoogleCalendar: async () => {},
        disconnectGoogleCalendar: async () => {},
        createCalendarEvent: async () => false,
      }}
    >
      {children}
    </IntegrationsContext.Provider>
  );
}

export const useIntegrations = () => useContext(IntegrationsContext);
