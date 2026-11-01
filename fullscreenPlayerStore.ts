import { create } from 'zustand';

type FullscreenPlayerState = {
  isOpen: boolean;
  showLyrics: boolean;
  open: () => void;
  close: () => void;
  toggleLyrics: () => void;
};

export const useFullscreenPlayerStore = create<FullscreenPlayerState>(
  (set) => ({
    isOpen: false,
    showLyrics: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  }),
);
