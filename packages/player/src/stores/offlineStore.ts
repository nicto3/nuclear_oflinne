import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

import type { Track } from '@nuclearplayer/model';

const OFFLINE_FILE = 'offline.json';
const store = new LazyStore(OFFLINE_FILE);

export type OfflineStreamInfo = {
  mimeType?: string;
  container?: string;
  codec?: string;
  bitrateKbps?: number;
  durationMs?: number;
};

export type OfflineTrackEntry = {
  key: string;
  fileName: string;
  sizeBytes: number;
  downloadedAtIso: string;
  track: Track;
  stream: OfflineStreamInfo;
};

export type OfflinePlaylistEntry = {
  playlistId: string;
  name: string;
  trackKeys: string[];
  totalCount: number;
  downloadedAtIso: string;
};

export type DownloadJobStatus = 'running' | 'done' | 'cancelled';

export type DownloadJob = {
  playlistId: string;
  name: string;
  total: number;
  completed: number;
  failed: number;
  currentTitle?: string;
  status: DownloadJobStatus;
  cancelRequested: boolean;
};

export const getTrackKey = (track: Track): string =>
  `${track.source.provider}:${track.source.id}`;

type OfflineState = {
  loaded: boolean;
  tracks: Record<string, OfflineTrackEntry>;
  playlists: Record<string, OfflinePlaylistEntry>;
  jobs: Record<string, DownloadJob>;

  loadFromDisk: () => Promise<void>;
  addTrack: (entry: OfflineTrackEntry) => Promise<void>;
  removeTracks: (keys: string[]) => Promise<void>;
  setPlaylist: (entry: OfflinePlaylistEntry) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;

  startJob: (job: DownloadJob) => void;
  updateJob: (playlistId: string, patch: Partial<DownloadJob>) => void;
  dismissJob: (playlistId: string) => void;
};

const saveToDisk = async (): Promise<void> => {
  const { tracks, playlists } = useOfflineStore.getState();
  await store.set('offline.tracks', tracks);
  await store.set('offline.playlists', playlists);
  await store.save();
};

export const useOfflineStore = create<OfflineState>((set, get) => ({
  loaded: false,
  tracks: {},
  playlists: {},
  jobs: {},

  loadFromDisk: async () => {
    const tracks =
      (await store.get<Record<string, OfflineTrackEntry>>('offline.tracks')) ??
      {};
    const playlists =
      (await store.get<Record<string, OfflinePlaylistEntry>>(
        'offline.playlists',
      )) ?? {};
    set({ tracks, playlists, loaded: true });
  },

  addTrack: async (entry) => {
    set({ tracks: { ...get().tracks, [entry.key]: entry } });
    await saveToDisk();
  },

  removeTracks: async (keys) => {
    const remaining = { ...get().tracks };
    for (const key of keys) {
      delete remaining[key];
    }
    set({ tracks: remaining });
    await saveToDisk();
  },

  setPlaylist: async (entry) => {
    set({ playlists: { ...get().playlists, [entry.playlistId]: entry } });
    await saveToDisk();
  },

  removePlaylist: async (playlistId) => {
    const remaining = { ...get().playlists };
    delete remaining[playlistId];
    set({ playlists: remaining });
    await saveToDisk();
  },

  startJob: (job) => {
    set({ jobs: { ...get().jobs, [job.playlistId]: job } });
  },

  updateJob: (playlistId, patch) => {
    const current = get().jobs[playlistId];
    if (!current) {
      return;
    }
    set({ jobs: { ...get().jobs, [playlistId]: { ...current, ...patch } } });
  },

  dismissJob: (playlistId) => {
    const remaining = { ...get().jobs };
    delete remaining[playlistId];
    set({ jobs: remaining });
  },
}));

export const initializeOfflineStore = async (): Promise<void> => {
  await useOfflineStore.getState().loadFromDisk();
};
