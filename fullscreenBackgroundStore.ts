import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

const store = new LazyStore('fullscreen.json');
const PERSIST_DELAY_MS = 400;

export type BackgroundMode = 'palette' | 'custom' | 'cover';

type BackgroundSettings = {
  mode: BackgroundMode;
  paletteIndex: number;
  customColor: string;
  coverBlur: number;
  coverDim: number;
};

type BackgroundState = BackgroundSettings & {
  loaded: boolean;
  loadFromDisk: () => Promise<void>;
  update: (patch: Partial<BackgroundSettings>) => void;
};

const DEFAULTS: BackgroundSettings = {
  mode: 'palette',
  paletteIndex: 0,
  customColor: '#3b7d2f',
  coverBlur: 40,
  coverDim: 0.35,
};

let persistTimer: ReturnType<typeof setTimeout> | undefined;

const pickSettings = (state: BackgroundState): BackgroundSettings => ({
  mode: state.mode,
  paletteIndex: state.paletteIndex,
  customColor: state.customColor,
  coverBlur: state.coverBlur,
  coverDim: state.coverDim,
});

export const useFullscreenBackgroundStore = create<BackgroundState>(
  (set, get) => ({
    ...DEFAULTS,
    loaded: false,

    loadFromDisk: async () => {
      const saved = await store.get<Partial<BackgroundSettings>>(
        'fullscreen.background',
      );
      set({ ...DEFAULTS, ...saved, loaded: true });
    },

    update: (patch) => {
      set(patch);
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        void store
          .set('fullscreen.background', pickSettings(get()))
          .then(() => store.save());
      }, PERSIST_DELAY_MS);
    },
  }),
);

export const initializeFullscreenBackgroundStore = async (): Promise<void> => {
  await useFullscreenBackgroundStore.getState().loadFromDisk();
};
