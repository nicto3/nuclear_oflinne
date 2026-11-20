import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

const store = new LazyStore('fullscreen.json');
const PERSIST_DELAY_MS = 400;

export type BackgroundMode = 'palette' | 'custom' | 'cover';

export type BackgroundSettings = {
  mode: BackgroundMode;
  paletteIndex: number;
  customColor: string;
  coverBlur: number;
  coverDim: number;
};

type BackgroundState = {
  loaded: boolean;
  defaults: BackgroundSettings;
  byTrack: Record<string, BackgroundSettings>;
  loadFromDisk: () => Promise<void>;
  update: (trackKey: string, patch: Partial<BackgroundSettings>) => void;
  reset: (trackKey: string) => void;
};

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  mode: 'palette',
  paletteIndex: 0,
  customColor: '#3b7d2f',
  coverBlur: 40,
  coverDim: 0.35,
};

let persistTimer: ReturnType<typeof setTimeout> | undefined;

const schedulePersist = (): void => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { defaults, byTrack } = useFullscreenBackgroundStore.getState();
    void store
      .set('fullscreen.defaults', defaults)
      .then(() => store.set('fullscreen.byTrack', byTrack))
      .then(() => store.save());
  }, PERSIST_DELAY_MS);
};

export const useFullscreenBackgroundStore = create<BackgroundState>(
  (set, get) => ({
    loaded: false,
    defaults: DEFAULT_BACKGROUND,
    byTrack: {},

    loadFromDisk: async () => {
      const legacy = await store.get<Partial<BackgroundSettings>>(
        'fullscreen.background',
      );
      const savedDefaults = await store.get<Partial<BackgroundSettings>>(
        'fullscreen.defaults',
      );
      const byTrack =
        (await store.get<Record<string, BackgroundSettings>>(
          'fullscreen.byTrack',
        )) ?? {};
      set({
        loaded: true,
        defaults: { ...DEFAULT_BACKGROUND, ...legacy, ...savedDefaults },
        byTrack,
      });
    },

    update: (trackKey, patch) => {
      const current = get().byTrack[trackKey] ?? get().defaults;
      set({
        byTrack: { ...get().byTrack, [trackKey]: { ...current, ...patch } },
      });
      schedulePersist();
    },

    reset: (trackKey) => {
      const remaining = { ...get().byTrack };
      delete remaining[trackKey];
      set({ byTrack: remaining });
      schedulePersist();
    },
  }),
);

export const getBackgroundSettings = (trackKey: string): BackgroundSettings => {
  const { byTrack, defaults } = useFullscreenBackgroundStore.getState();
  return byTrack[trackKey] ?? defaults;
};

export const initializeFullscreenBackgroundStore = async (): Promise<void> => {
  await useFullscreenBackgroundStore.getState().loadFromDisk();
};
