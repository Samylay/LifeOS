"use client";

import { useState, useEffect, useCallback } from "react";
import { getProfile, setProfile } from "./firestore";
import type { UserProfile } from "./types";
import { useAuth } from "./auth-context";

export function useProfile() {
  const { user, isFirebaseConfigured } = useAuth();
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setLoading(false);
      return;
    }

    async function loadProfile() {
      try {
        const p = await getProfile(user!.uid);
        if (p) {
          setProfileState(p);
        } else {
          // Initialize default profile
          const defaultProfile: Omit<UserProfile, "id"> = {
            email: user!.email || "",
            displayName: user!.displayName || "",
            createdAt: new Date(),
            focusSettings: {
              defaultFocus: 25,
              defaultBreak: 5,
              defaultLongBreak: 15,
              longBreakAfter: 4,
              autoStartNext: false,
              blocklist: [],
              allowlist: [],
            },
          };
          await setProfile(user!.uid, defaultProfile);
          setProfileState({ ...defaultProfile, id: "settings" } as UserProfile);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user, isFirebaseConfigured]);

  const updateProfile = useCallback(
    async (data: Partial<UserProfile>) => {
      if (!user) return;
      try {
        await setProfile(user.uid, data);
        setProfileState((prev) => (prev ? { ...prev, ...data } : null));
      } catch (error) {
        console.error("Error updating profile:", error);
      }
    },
    [user]
  );

  const updateFocusSettings = useCallback(
    async (settings: Partial<UserProfile["focusSettings"]>) => {
      if (!profile) return;
      const updatedProfile = {
        ...profile,
        focusSettings: { ...profile.focusSettings, ...settings },
      };
      await updateProfile({ focusSettings: updatedProfile.focusSettings });
    },
    [profile, updateProfile]
  );

  return {
    profile,
    loading,
    updateProfile,
    updateFocusSettings,
  };
}
