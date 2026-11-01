import type { Track } from '@nuclearplayer/model';

export type LyricsSourceId = 'lrclib' | 'netease' | 'genius';

export type LyricsCandidate = {
  id: string;
  source: LyricsSourceId;
  sourceName: string;
  artist: string;
  title: string;
  durationSec?: number;
  synced?: string;
  plain?: string;
  instrumental?: boolean;
  ref?: string;
};

export type SourceSearch = {
  query: string;
  artist?: string;
  title?: string;
  durationSec?: number;
};

export type LyricsSource = {
  id: LyricsSourceId;
  name: string;
  search: (params: SourceSearch) => Promise<LyricsCandidate[]>;
  load: (candidate: LyricsCandidate) => Promise<LyricsCandidate>;
};

export type SavedLine = { startMs?: number; text: string };

export type SavedLyrics = {
  sourceLabel: string;
  savedAtIso: string;
  manual: boolean;
  instrumental?: boolean;
  synced: boolean;
  lines: SavedLine[];
};

export type Query = { artist: string; title: string };

export const MIN_TITLE_LENGTH = 3;

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const durationOf = (track: Track): number | undefined =>
  track.durationMs ? Math.round(track.durationMs / 1000) : undefined;

export const isLoadable = (candidate: LyricsCandidate): boolean =>
  Boolean(
    candidate.synced ||
    candidate.plain ||
    candidate.instrumental ||
    candidate.ref,
  );

export const titleMatches = (
  candidateTitle: string,
  wanted: string,
): boolean => {
  const found = normalize(candidateTitle);
  const target = normalize(wanted);
  if (found.length < MIN_TITLE_LENGTH || target.length < MIN_TITLE_LENGTH) {
    return false;
  }
  return found.includes(target) || target.includes(found);
};

export const artistMatches = (
  candidateArtist: string,
  hints: string[],
): boolean => {
  const found = normalize(candidateArtist);
  if (found.length < 2) {
    return false;
  }
  return hints.some((hint) => found.includes(hint) || hint.includes(found));
};

export const rankCandidates = (
  candidates: LyricsCandidate[],
  hints: string[],
  durationSec: number | undefined,
): LyricsCandidate[] => {
  const distance = (candidate: LyricsCandidate) =>
    durationSec && candidate.durationSec
      ? Math.abs(candidate.durationSec - durationSec)
      : 0;
  const score = (candidate: LyricsCandidate) =>
    Number(artistMatches(candidate.artist, hints)) * 2 +
    Number(Boolean(candidate.synced) || candidate.source === 'netease');
  return [...candidates].sort((first, second) => {
    const scoreDiff = score(second) - score(first);
    return scoreDiff !== 0 ? scoreDiff : distance(first) - distance(second);
  });
};

export const pickBest = (
  candidates: LyricsCandidate[],
  wanted: Query,
  hints: string[],
  durationSec: number | undefined,
): LyricsCandidate | undefined => {
  const matching = candidates
    .filter(isLoadable)
    .filter((candidate) => titleMatches(candidate.title, wanted.title))
    .filter((candidate) => artistMatches(candidate.artist, hints));
  if (matching.length === 0) {
    return undefined;
  }
  const syncedFirst = [...matching].sort(
    (first, second) =>
      Number(Boolean(second.synced)) - Number(Boolean(first.synced)),
  );
  return rankCandidates(syncedFirst, hints, durationSec)[0];
};
