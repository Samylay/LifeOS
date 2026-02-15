import { create } from "zustand";
import type { AreaId } from "./types";

interface BlockConfig {
  blockId: string;
  title: string;
  sessionDuration: number;
  breakDuration: number;
  area?: AreaId;
}

interface AppState {
  sidebarExpanded: boolean;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;

  // Focus block → timer integration
  pendingBlockConfig: BlockConfig | null;
  setPendingBlockConfig: (config: BlockConfig | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarExpanded: true,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

  pendingBlockConfig: null,
  setPendingBlockConfig: (config) => set({ pendingBlockConfig: config }),
}));
