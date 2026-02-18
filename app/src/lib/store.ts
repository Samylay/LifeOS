import { create } from "zustand";

interface AppState {
  sidebarExpanded: boolean;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  chatPanelOpen: boolean;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarExpanded: true,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  chatPanelOpen: false,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
}));
