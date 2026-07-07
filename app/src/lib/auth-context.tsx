"use client";

import { createContext, useContext, ReactNode } from "react";

// Single-user, self-hosted: there is no sign-in. We expose a fixed local
// "user" so every hook's `if (isFirebaseConfigured && user)` branch stays on
// the persistent (server-backed) path. All data lives under users/local/*.
export const LOCAL_USER = {
  uid: "local",
  email: "local@lifeos",
  displayName: "Me",
  photoURL: null as string | null,
  getIdToken: async () => "local",
};

type LocalUser = typeof LOCAL_USER;

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: LOCAL_USER,
  loading: false,
  isFirebaseConfigured: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{ user: LOCAL_USER, loading: false, isFirebaseConfigured: true }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
