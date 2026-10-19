import type { StreamCandidate, Track } from '@nuclearplayer/model';

import {
  getTrackKey,
  useOfflineStore,
  type OfflineTrackEntry,
} from '../../stores/offlineStore';
import { OFFLINE_PROVIDER_ID, toOfflineUrl } from './offlineUrl';

export const buildOfflineCandidate = (
  entry: OfflineTrackEntry,
): StreamCandidate => {
  const source = { provider: OFFLINE_PROVIDER_ID, id: entry.key };

  return {
    id: `${OFFLINE_PROVIDER_ID}:${entry.key}`,
    title: entry.track.title,
    durationMs: entry.stream.durationMs ?? entry.track.durationMs,
    failed: false,
    source,
    stream: {
      url: toOfflineUrl(entry.fileName),
      protocol: 'http',
      mimeType: entry.stream.mimeType,
      container: entry.stream.container,
      codec: entry.stream.codec,
      bitrateKbps: entry.stream.bitrateKbps,
      durationMs: entry.stream.durationMs ?? entry.track.durationMs,
      source,
    },
  };
};

export const findOfflineCandidate = (
  track: Track,
): StreamCandidate | undefined => {
  const entry = useOfflineStore.getState().tracks[getTrackKey(track)];
  return entry ? buildOfflineCandidate(entry) : undefined;
};

export const isOfflineCandidate = (candidate: StreamCandidate): boolean =>
  candidate.source.provider === OFFLINE_PROVIDER_ID;
