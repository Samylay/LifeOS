import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  sidebarExpanded: boolean;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarExpanded: true,
      toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
    }),
    {
      name: "lifeos-shell",
      // Only the desktop sidebar preference survives reloads — transient
      // drawer/panel state must never rehydrate open.
      partialize: (s) => ({ sidebarExpanded: s.sidebarExpanded }),
    }
  )
);
