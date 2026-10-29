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
import {
  offlineDelete,
  offlineDownload,
  offlineDownloadHls,
} from '../tauri/offline';

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

export const getFileBaseName = fileBaseName;

type DownloadOutcome = {
  entry: OfflineTrackEntry;
  wasExisting: boolean;
};

const inFlight = new Map<string, Promise<DownloadOutcome>>();

const runDownload = async (track: Track): Promise<DownloadOutcome> => {
  const key = getTrackKey(track);

  const candidates = await candidatesForTrack(track);
  if (!candidates?.length) {
    throw new Error('No stream candidates found');
  }

  let lastError: unknown;
  const skipped: string[] = [];

  for (const candidate of candidates) {
    if (candidate.failed) {
      skipped.push('candidate marked as failed');
      continue;
    }

    const resolved = await streamingHost.resolveStreamForCandidate(candidate);
    const stream = resolved?.stream;
    if (!resolved || resolved.failed || !stream) {
      skipped.push('stream could not be resolved');
      continue;
    }
    if (stream.protocol === 'file') {
      skipped.push('stream is a local file');
      continue;
    }

    const isHls = stream.protocol === 'hls';
    const baseName = fileBaseName(key);
    const fileName = isHls ? baseName : `${baseName}.${extensionFor(stream)}`;

    try {
      const sizeBytes = isHls
        ? await offlineDownloadHls(stream.url, fileName)
        : await offlineDownload(stream.url, fileName);
      const entry: OfflineTrackEntry = {
        key,
        kind: isHls ? 'hls' : 'file',
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
      return { entry, wasExisting: false };
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ??
    new Error(
      skipped.length > 0
        ? `No downloadable stream (${skipped.join(', ')})`
        : 'No downloadable stream found',
    )
  );
};

const downloadTrack = (track: Track): Promise<DownloadOutcome> => {
  const key = getTrackKey(track);

  const existing = useOfflineStore.getState().tracks[key];
  if (existing) {
    return Promise.resolve({ entry: existing, wasExisting: true });
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending.then((outcome) => ({ ...outcome, wasExisting: true }));
  }

  const promise = runDownload(track).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
};

const DISMISS_DELAY_MS = 4000;

export type DownloadRequest = {
  name: string;
  tracks: Track[];
  createPlaylist?: { name: string };
};

export const downloadTracks = async ({
  name,
  tracks,
  createPlaylist,
}: DownloadRequest): Promise<void> => {
  const jobId = `job-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const store = useOfflineStore.getState();

  store.startJob({
    jobId,
    name,
    total: tracks.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    status: 'running',
    cancelRequested: false,
  });
  toast.info(i18n.t('offline:toast.started', { name }));

  const trackKeys: string[] = [];
  let failed = 0;
  let skipped = 0;
  let lastError: string | undefined;
  let cancelled = false;

  try {
    for (const track of tracks) {
      if (useOfflineStore.getState().jobs[jobId]?.cancelRequested) {
        cancelled = true;
        break;
      }

      useOfflineStore
        .getState()
        .updateJob(jobId, { currentTitle: track.title });

      try {
        const { entry, wasExisting } = await downloadTrack(track);
        trackKeys.push(entry.key);
        if (wasExisting) {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        lastError = errorMessage(error);
        await Logger.streaming.warn(
          `Offline download of '${track.title}' failed: ${lastError}`,
        );
      }

      useOfflineStore.getState().updateJob(jobId, {
        completed: trackKeys.length,
        failed,
        skipped,
        lastError,
      });
    }

    if (createPlaylist && trackKeys.length > 0) {
      const now = new Date().toISOString();
      await useOfflineStore.getState().setPlaylist({
        playlistId: `of-${Date.now().toString(36)}`,
        name: createPlaylist.name,
        trackKeys,
        totalCount: trackKeys.length,
        downloadedAtIso: now,
        updatedAtIso: now,
      });
    }
  } finally {
    useOfflineStore.getState().updateJob(jobId, {
      status: cancelled ? 'cancelled' : 'done',
      currentTitle: undefined,
    });
  }

  const downloaded = trackKeys.length - skipped;
  if (cancelled) {
    toast.info(i18n.t('offline:toast.cancelled', { name }));
  } else if (failed > 0) {
    toast.warning(
      i18n.t('offline:toast.finishedWithErrors', {
        name,
        count: downloaded,
        failed,
      }),
    );
  } else if (skipped > 0) {
    toast.success(
      i18n.t('offline:toast.finishedWithSkipped', {
        name,
        count: downloaded,
        skipped,
      }),
    );
  } else {
    toast.success(
      i18n.t('offline:toast.finished', { name, count: downloaded }),
    );
  }

  if (!cancelled && failed === 0) {
    setTimeout(() => {
      useOfflineStore.getState().dismissJob(jobId);
    }, DISMISS_DELAY_MS);
  }
};

export const downloadSingleTrack = (track: Track): Promise<void> =>
  downloadTracks({ name: track.title, tracks: [track] });

export const cancelDownload = (jobId: string): void => {
  useOfflineStore.getState().updateJob(jobId, { cancelRequested: true });
};

const deleteEntryFiles = async (
  entries: OfflineTrackEntry[],
): Promise<void> => {
  for (const entry of entries) {
    try {
      await offlineDelete(entry.fileName);
    } catch (error) {
      await Logger.streaming.warn(
        `Could not delete offline file ${entry.fileName}: ${errorMessage(error)}`,
      );
    }
  }
};

export const deleteLibraryTracks = async (keys: string[]): Promise<void> => {
  const { tracks } = useOfflineStore.getState();
  const entries = keys
    .map((key) => tracks[key])
    .filter((entry): entry is OfflineTrackEntry => Boolean(entry));
  await deleteEntryFiles(entries);
  await useOfflineStore.getState().removeTracks(keys);
};

export const removeOfflinePlaylist = async (
  playlistId: string,
): Promise<void> => {
  await useOfflineStore.getState().removePlaylist(playlistId);
};

export const forgetOfflineTrack = async (track: Track): Promise<void> => {
  await deleteLibraryTracks([getTrackKey(track)]);
};
