import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

import type { SavedLyrics } from '../services/lyrics/lyricsTypes';

const store = new LazyStore('lyrics.json');

type LyricsState = {
  loaded: boolean;
  saved: Record<string, SavedLyrics>;
  loadFromDisk: () => Promise<void>;
  save: (key: string, lyrics: SavedLyrics) => Promise<void>;
  remove: (key: string) => Promise<void>;
  setOffset: (key: string, offsetMs: number) => void;
};

const OFFSET_PERSIST_DELAY_MS = 600;
let offsetTimer: ReturnType<typeof setTimeout> | undefined;

const persist = async (): Promise<void> => {
  await store.set('lyrics.saved', useLyricsStore.getState().saved);
  await store.save();
};

export const useLyricsStore = create<LyricsState>((set, get) => ({
  loaded: false,
  saved: {},

  loadFromDisk: async () => {
    const saved =
      (await store.get<Record<string, SavedLyrics>>('lyrics.saved')) ?? {};
    set({ saved, loaded: true });
  },

  save: async (key, lyrics) => {
    set({ saved: { ...get().saved, [key]: lyrics } });
    await persist();
  },

  setOffset: (key, offsetMs) => {
    const current = get().saved[key];
    if (!current) {
      return;
    }
    set({ saved: { ...get().saved, [key]: { ...current, offsetMs } } });
    clearTimeout(offsetTimer);
    offsetTimer = setTimeout(() => void persist(), OFFSET_PERSIST_DELAY_MS);
  },

  remove: async (key) => {
    const remaining = { ...get().saved };
    delete remaining[key];
    set({ saved: remaining });
    await persist();
  },
}));

export const initializeLyricsStore = async (): Promise<void> => {
  await useLyricsStore.getState().loadFromDisk();
};
