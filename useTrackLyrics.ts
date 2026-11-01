import { useQuery } from '@tanstack/react-query';

import type { Track } from '@nuclearplayer/model';

import { autoFindLyrics } from '../services/lyrics/lyricsService';
import { useLyricsStore } from '../stores/lyricsStore';
import { getTrackKey } from '../stores/offlineStore';

const CACHE_TIME_MS = 10 * 60 * 1000;

export const useTrackLyrics = (track: Track | undefined) => {
  const key = track ? getTrackKey(track) : '';
  const saved = useLyricsStore((state) => (key ? state.saved[key] : undefined));

  const query = useQuery({
    queryKey: ['auto-lyrics', key],
    queryFn: () => autoFindLyrics(track as Track),
    enabled: Boolean(track) && !saved,
    staleTime: Infinity,
    gcTime: CACHE_TIME_MS,
    retry: false,
  });

  return {
    key,
    saved,
    isLoading: Boolean(track) && !saved && query.isFetching,
    suggestions: query.data?.suggestions ?? [],
    error: saved ? null : query.error,
    refetch: query.refetch,
  };
};
