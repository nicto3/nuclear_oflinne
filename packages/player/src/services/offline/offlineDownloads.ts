import { toast } from 'sonner';

import { i18n } from '@nuclearplayer/i18n';
import type { Stream, Track } from '@nuclearplayer/model';
import { stripResolutionState } from '@nuclearplayer/model';

import {
  getTrackKey,
  useOfflineStore,
  type OfflineTrackEntry,
} from '../../stores/offlineStore';
import { errorMessage } from '../../utils/errorMessage';
import { Logger } from '../logger';
import { streamingHost } from '../streamingHost';
import { candidatesForTrack } from '../streamResolution/candidateSource';
import { offlineDelete, offlineDownload } from '../tauri/offline';

const EXTENSIONS_BY_CONTAINER: Record<string, string> = {
  m4a: 'm4a',
  mp4: 'm4a',
  webm: 'webm',
  opus: 'opus',
  ogg: 'ogg',
  mp3: 'mp3',
  aac: 'aac',
  flac: 'flac',
  wav: 'wav',
};

const EXTENSIONS_BY_MIME_PREFIX: [string, string][] = [
  ['audio/mp4', 'm4a'],
  ['audio/webm', 'webm'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/aac', 'aac'],
  ['audio/flac', 'flac'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
];

const extensionFor = (stream: Stream): string => {
  const fromContainer = stream.container
    ? EXTENSIONS_BY_CONTAINER[stream.container.toLowerCase()]
    : undefined;
  if (fromContainer) {
    return fromContainer;
  }

  const mimeType = stream.mimeType?.toLowerCase();
  const fromMime = mimeType
    ? EXTENSIONS_BY_MIME_PREFIX.find(([prefix]) => mimeType.startsWith(prefix))
    : undefined;
  return fromMime ? fromMime[1] : 'audio';
};

const hashText = (text: string, seed: number): number => {
  let first = 0xdeadbeef ^ seed;
  let second = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first =
    Math.imul(first ^ (first >>> 16), 2246822507) ^
    Math.imul(second ^ (second >>> 13), 3266489909);
  second =
    Math.imul(second ^ (second >>> 16), 2246822507) ^
    Math.imul(first ^ (first >>> 13), 3266489909);
  return 4294967296 * (2097151 & second) + (first >>> 0);
};

const fileBaseName = (key: string): string =>
  [hashText(key, 0), hashText(key, 1)]
    .map((value) => value.toString(16).padStart(14, '0'))
    .join('');

const downloadTrack = async (track: Track): Promise<OfflineTrackEntry> => {
  const key = getTrackKey(track);
  const existing = useOfflineStore.getState().tracks[key];
  if (existing) {
    return existing;
  }

  const candidates = await candidatesForTrack(track);
  if (!candidates?.length) {
    throw new Error('No stream candidates found');
  }

  let lastError: unknown = new Error('No downloadable stream found');
  for (const candidate of candidates) {
    if (candidate.failed) {
      continue;
    }

    const resolved = await streamingHost.resolveStreamForCandidate(candidate);
    const stream = resolved?.stream;
    if (
      !resolved ||
      resolved.failed ||
      !stream ||
      (stream.protocol !== 'http' && stream.protocol !== 'https')
    ) {
      continue;
    }

    const fileName = `${fileBaseName(key)}.${extensionFor(stream)}`;
    try {
      const sizeBytes = await offlineDownload(stream.url, fileName);
      const entry: OfflineTrackEntry = {
        key,
        fileName,
        sizeBytes,
        downloadedAtIso: new Date().toISOString(),
        track: stripResolutionState(track),
        stream: {
          mimeType: stream.mimeType,
          container: stream.container,
          codec: stream.codec,
          bitrateKbps: stream.bitrateKbps,
          durationMs:
            stream.durationMs ?? resolved.durationMs ?? track.durationMs,
        },
      };
      await useOfflineStore.getState().addTrack(entry);
      return entry;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const cleanupOrphans = async (): Promise<void> => {
  const { tracks, playlists, jobs } = useOfflineStore.getState();
  if (Object.values(jobs).some((job) => job.status === 'running')) {
    return;
  }

  const referenced = new Set(
    Object.values(playlists).flatMap((playlist) => playlist.trackKeys),
  );
  const orphans = Object.values(tracks).filter(
    (entry) => !referenced.has(entry.key),
  );
  if (orphans.length === 0) {
    return;
  }

  for (const entry of orphans) {
    try {
      await offlineDelete(entry.fileName);
    } catch (error) {
      await Logger.streaming.warn(
        `Could not delete offline file ${entry.fileName}: ${errorMessage(error)}`,
      );
    }
  }
  await useOfflineStore
    .getState()
    .removeTracks(orphans.map((entry) => entry.key));
};

export const downloadPlaylist = async (
  playlistId: string,
  name: string,
  tracks: Track[],
): Promise<void> => {
  const store = useOfflineStore.getState();
  if (store.jobs[playlistId]?.status === 'running') {
    return;
  }

  store.startJob({
    playlistId,
    name,
    total: tracks.length,
    completed: 0,
    failed: 0,
    status: 'running',
    cancelRequested: false,
  });
  toast.info(i18n.t('offline:toast.started', { name }));

  const trackKeys: string[] = [];
  let failed = 0;
  let cancelled = false;

  try {
    for (const track of tracks) {
      if (useOfflineStore.getState().jobs[playlistId]?.cancelRequested) {
        cancelled = true;
        break;
      }

      useOfflineStore
        .getState()
        .updateJob(playlistId, { currentTitle: track.title });

      try {
        const entry = await downloadTrack(track);
        trackKeys.push(entry.key);
      } catch (error) {
        failed += 1;
        await Logger.streaming.warn(
          `Offline download of '${track.title}' failed: ${errorMessage(error)}`,
        );
      }

      useOfflineStore
        .getState()
        .updateJob(playlistId, { completed: trackKeys.length, failed });
    }

    await useOfflineStore.getState().setPlaylist({
      playlistId,
      name,
      trackKeys,
      totalCount: tracks.length,
      downloadedAtIso: new Date().toISOString(),
    });
  } finally {
    useOfflineStore.getState().updateJob(playlistId, {
      status: cancelled ? 'cancelled' : 'done',
      currentTitle: undefined,
    });
  }

  await cleanupOrphans();

  if (cancelled) {
    toast.info(i18n.t('offline:toast.cancelled', { name }));
  } else if (failed > 0) {
    toast.warning(
      i18n.t('offline:toast.finishedWithErrors', {
        name,
        count: trackKeys.length,
        failed,
      }),
    );
  } else {
    toast.success(
      i18n.t('offline:toast.finished', { name, count: trackKeys.length }),
    );
  }
};

export const cancelDownload = (playlistId: string): void => {
  useOfflineStore.getState().updateJob(playlistId, { cancelRequested: true });
};

export const removeOfflinePlaylist = async (
  playlistId: string,
): Promise<void> => {
  const store = useOfflineStore.getState();
  await store.removePlaylist(playlistId);
  store.dismissJob(playlistId);
  await cleanupOrphans();
};

export const forgetOfflineTrack = async (track: Track): Promise<void> => {
  const entry = useOfflineStore.getState().tracks[getTrackKey(track)];
  if (!entry) {
    return;
  }

  try {
    await offlineDelete(entry.fileName);
  } catch (error) {
    await Logger.streaming.warn(
      `Could not delete offline file ${entry.fileName}: ${errorMessage(error)}`,
    );
  }
  await useOfflineStore.getState().removeTracks([entry.key]);
};
