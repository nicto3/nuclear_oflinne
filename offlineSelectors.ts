import { pickArtwork, type Track } from '@nuclearplayer/model';

import type {
  OfflinePlaylistEntry,
  OfflineTrackEntry,
} from '../../stores/offlineStore';

const THUMBNAIL_COUNT = 4;

export const formatSize = (bytes: number): string => {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(1)} GB`;
  }
  return `${megabytes.toFixed(1)} MB`;
};

export const getPlaylistKeys = (
  entry: OfflinePlaylistEntry,
  tracks: Record<string, OfflineTrackEntry>,
): string[] => entry.trackKeys.filter((key) => key in tracks);

export const getPlaylistTracks = (
  entry: OfflinePlaylistEntry,
  tracks: Record<string, OfflineTrackEntry>,
): Track[] => getPlaylistKeys(entry, tracks).map((key) => tracks[key].track);

export const getPlaylistSize = (
  entry: OfflinePlaylistEntry,
  tracks: Record<string, OfflineTrackEntry>,
): number =>
  Array.from(new Set(getPlaylistKeys(entry, tracks))).reduce(
    (total, key) => total + tracks[key].sizeBytes,
    0,
  );

export const getPlaylistThumbnails = (
  entry: OfflinePlaylistEntry,
  tracks: Record<string, OfflineTrackEntry>,
): string[] => {
  const urls: string[] = [];
  for (const track of getPlaylistTracks(entry, tracks)) {
    const url = pickArtwork(track.artwork, 'thumbnail', 128)?.url;
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
    if (urls.length >= THUMBNAIL_COUNT) {
      break;
    }
  }
  return urls;
};
