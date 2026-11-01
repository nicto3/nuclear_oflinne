import { create } from 'zustand';

type FullscreenPlayerState = {
  isOpen: boolean;
  showLyrics: boolean;
  sourcePanelOpen: boolean;
  open: () => void;
  close: () => void;
  toggleLyrics: () => void;
  toggleSourcePanel: () => void;
  closeSourcePanel: () => void;
};

export const useFullscreenPlayerStore = create<FullscreenPlayerState>(
  (set) => ({
    isOpen: false,
    showLyrics: false,
    sourcePanelOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false, sourcePanelOpen: false }),
    toggleLyrics: () =>
      set((state) => ({
        showLyrics: !state.showLyrics,
        sourcePanelOpen: false,
      })),
    toggleSourcePanel: () =>
      set((state) => ({ sourcePanelOpen: !state.sourcePanelOpen })),
    closeSourcePanel: () => set({ sourcePanelOpen: false }),
  }),
);
