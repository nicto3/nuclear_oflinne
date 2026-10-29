import { open } from '@tauri-apps/plugin-dialog';

import type { Track } from '@nuclearplayer/model';

import { useOfflineStore } from '../../stores/offlineStore';
import { offlineDelete, offlineImportFile } from '../tauri/offline';

const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'wav',
  'flac',
  'webm',
];
const FILE_BASE_LENGTH = 28;

export const getFileNameFromPath = (path: string): string =>
  path.split(/[\\/]/).pop() ?? path;

export const pickAudioFile = async (): Promise<string | null> => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  return typeof selected === 'string' ? selected : null;
};

export const readImageAsDataUrl = (
  file: File,
  maxSize = 512,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Unsupported image format'));
      image.onload = () => {
        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Could not process the image'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export type TrackEdits = {
  title: string;
  artistName: string;
  coverDataUrl?: string;
  audioSourcePath?: string;
};

const withEditedMetadata = (track: Track, edits: TrackEdits): Track => {
  const title = edits.title.trim() || track.title;
  const artistName = edits.artistName.trim();

  const artists =
    artistName.length === 0
      ? track.artists
      : track.artists.length > 0
        ? [{ ...track.artists[0], name: artistName }, ...track.artists.slice(1)]
        : [{ name: artistName, roles: [] }];

  const artwork = edits.coverDataUrl
    ? {
        items: [
          {
            url: edits.coverDataUrl,
            width: 512,
            height: 512,
            purpose: 'cover' as const,
          },
          {
            url: edits.coverDataUrl,
            width: 200,
            height: 200,
            purpose: 'thumbnail' as const,
          },
        ],
      }
    : track.artwork;

  return { ...track, title, artists, artwork };
};

export const applyTrackEdits = async (
  key: string,
  edits: TrackEdits,
): Promise<void> => {
  const store = useOfflineStore.getState();
  const entry = store.tracks[key];
  if (!entry) {
    throw new Error('This track is no longer in the offline library');
  }

  const track = withEditedMetadata(entry.track, edits);

  if (!edits.audioSourcePath) {
    await store.updateTrack(key, { track });
    return;
  }

  const extension = getFileNameFromPath(edits.audioSourcePath)
    .split('.')
    .pop()
    ?.toLowerCase();
  if (!extension || !AUDIO_EXTENSIONS.includes(extension)) {
    throw new Error('Unsupported audio file format');
  }

  const newFileName = `${entry.fileName.slice(0, FILE_BASE_LENGTH)}-c${Date.now().toString(36)}.${extension}`;
  const sizeBytes = await offlineImportFile(edits.audioSourcePath, newFileName);

  await store.updateTrack(key, {
    track,
    kind: 'file',
    fileName: newFileName,
    sizeBytes,
    stream: {},
  });

  try {
    await offlineDelete(entry.fileName);
  } catch {
    // The old file is orphaned but harmless; the new one is already in place.
  }
};
