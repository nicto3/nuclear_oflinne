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
  kind?: 'file' | 'hls';
  fileName: string;
  sizeBytes: number;
  downloadedAtIso: string;
  track: Track;
  stream: OfflineStreamInfo;
};

export type OfflinePlaylistEntry = {
  playlistId: string;
  name: string;
  description?: string;
  coverDataUrl?: string;
  trackKeys: string[];
  totalCount?: number;
  downloadedAtIso: string;
  updatedAtIso?: string;
};

export type DownloadJobStatus = 'running' | 'done' | 'cancelled';

export type DownloadJob = {
  jobId: string;
  name: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentTitle?: string;
  lastError?: string;
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
  updateTrack: (
    key: string,
    patch: Partial<OfflineTrackEntry>,
  ) => Promise<void>;
  removeTracks: (keys: string[]) => Promise<void>;
  setPlaylist: (entry: OfflinePlaylistEntry) => Promise<void>;
  updatePlaylist: (
    playlistId: string,
    patch: Partial<OfflinePlaylistEntry>,
  ) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;

  startJob: (job: DownloadJob) => void;
  updateJob: (jobId: string, patch: Partial<DownloadJob>) => void;
  dismissJob: (jobId: string) => void;
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

  updateTrack: async (key, patch) => {
    const current = get().tracks[key];
    if (!current) {
      return;
    }
    set({ tracks: { ...get().tracks, [key]: { ...current, ...patch } } });
    await saveToDisk();
  },

  removeTracks: async (keys) => {
    const removed = new Set(keys);
    const remainingTracks = { ...get().tracks };
    for (const key of keys) {
      delete remainingTracks[key];
    }
    const updatedPlaylists = Object.fromEntries(
      Object.entries(get().playlists).map(([id, playlist]) => [
        id,
        {
          ...playlist,
          trackKeys: playlist.trackKeys.filter((key) => !removed.has(key)),
        },
      ]),
    );
    set({ tracks: remainingTracks, playlists: updatedPlaylists });
    await saveToDisk();
  },

  setPlaylist: async (entry) => {
    set({ playlists: { ...get().playlists, [entry.playlistId]: entry } });
    await saveToDisk();
  },

  updatePlaylist: async (playlistId, patch) => {
    const current = get().playlists[playlistId];
    if (!current) {
      return;
    }
    set({
      playlists: {
        ...get().playlists,
        [playlistId]: {
          ...current,
          ...patch,
          updatedAtIso: new Date().toISOString(),
        },
      },
    });
    await saveToDisk();
  },

  removePlaylist: async (playlistId) => {
    const remaining = { ...get().playlists };
    delete remaining[playlistId];
    set({ playlists: remaining });
    await saveToDisk();
  },

  startJob: (job) => {
    set({ jobs: { ...get().jobs, [job.jobId]: job } });
  },

  updateJob: (jobId, patch) => {
    const current = get().jobs[jobId];
    if (!current) {
      return;
    }
    set({ jobs: { ...get().jobs, [jobId]: { ...current, ...patch } } });
  },

  dismissJob: (jobId) => {
    const remaining = { ...get().jobs };
    delete remaining[jobId];
    set({ jobs: remaining });
  },
}));

export const initializeOfflineStore = async (): Promise<void> => {
  await useOfflineStore.getState().loadFromDisk();
};
