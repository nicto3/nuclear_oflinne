import type { Lyrics, Track } from '@nuclearplayer/model';
import type { LyricsProvider } from '@nuclearplayer/plugin-sdk';

import { useLyricsStore } from '../../stores/lyricsStore';
import { getTrackKey } from '../../stores/offlineStore';
import { Logger } from '../logger';
import { providersHost } from '../providersHost';
import { geniusSource } from './geniusSource';
import {
  buildQueries,
  collectArtistHints,
  lrclibSource,
  parseLrc,
} from './lrclibProvider';
import {
  durationOf,
  isLoadable,
  normalize,
  pickBest,
  rankCandidates,
  titleMatches,
  type LyricsCandidate,
  type LyricsSource,
  type SavedLyrics,
} from './lyricsTypes';
import { neteaseSource } from './neteaseSource';

const SOURCES: LyricsSource[] = [lrclibSource, neteaseSource, geniusSource];
const AUTO_PROVIDER_ID = 'auto-lyrics';
const MAX_STRICT_QUERIES = 3;
const MAX_SUGGESTIONS = 8;
const MAX_PER_SOURCE = 6;
const LAST_LINE_MS = 5000;
const SPEED_VARIANT_REGEX = /sped\s*up|speed\s*up|speedup|nightcore|slowed/i;
const MIN_SPEED_SCALE = 0.5;
const MAX_SPEED_SCALE = 2;
const SCALE_TOLERANCE = 0.03;
const MANUAL_SCALE_THRESHOLD = 0.08;

export type AutoResult = {
  found: boolean;
  suggestions: LyricsCandidate[];
};

export type SearchOutcome = {
  candidates: LyricsCandidate[];
  errors: string[];
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const sourceById = (id: LyricsCandidate['source']): LyricsSource =>
  SOURCES.find((source) => source.id === id) ?? lrclibSource;

const computeScale = (
  track: Track,
  candidateDurationSec: number | undefined,
  manual: boolean,
): number => {
  const trackSeconds = track.durationMs ? track.durationMs / 1000 : 0;
  if (!trackSeconds || !candidateDurationSec) {
    return 1;
  }
  const ratio = trackSeconds / candidateDurationSec;
  if (ratio <= MIN_SPEED_SCALE || ratio >= MAX_SPEED_SCALE) {
    return 1;
  }
  const deviation = Math.abs(ratio - 1);
  const isSpeedVariant = SPEED_VARIANT_REGEX.test(track.title);
  if (isSpeedVariant && deviation > SCALE_TOLERANCE) {
    return ratio;
  }
  return manual && deviation > MANUAL_SCALE_THRESHOLD ? ratio : 1;
};

export const buildSavedLyrics = (
  candidate: LyricsCandidate,
  track: Track,
  manual: boolean,
): SavedLyrics | undefined => {
  const base = {
    sourceLabel: `${candidate.sourceName} · ${candidate.artist} — ${candidate.title}`,
    savedAtIso: new Date().toISOString(),
    manual,
  };

  if (candidate.instrumental) {
    return { ...base, instrumental: true, synced: false, lines: [] };
  }

  if (candidate.synced) {
    const lines = parseLrc(candidate.synced);
    if (lines.length > 0) {
      const scale = computeScale(track, candidate.durationSec, manual);
      return {
        ...base,
        synced: true,
        lines: lines.map((line) => ({
          startMs: Math.round(line.startMs * scale),
          text: line.text,
        })),
      };
    }
  }

  if (candidate.plain) {
    return {
      ...base,
      synced: false,
      lines: candidate.plain
        .split(/\r?\n/)
        .map((line) => ({ text: line.trimEnd() })),
    };
  }
  return undefined;
};

export const savedToLyrics = (
  saved: SavedLyrics,
  durationMs?: number,
): Lyrics => {
  if (saved.instrumental) {
    return { type: 'instrumental', metadata: {} };
  }
  if (!saved.synced) {
    return {
      type: 'plain',
      metadata: {},
      sections: [
        {
          lines: saved.lines.map((line) => ({
            segments: [{ text: line.text }],
          })),
        },
      ],
    };
  }
  return {
    type: 'lineSynced',
    metadata: {},
    sections: [
      {
        lines: saved.lines.map((line, index) => {
          const startMs = line.startMs ?? 0;
          const next = saved.lines[index + 1]?.startMs;
          return {
            segments: [{ text: line.text }],
            startMs,
            endMs: next ?? Math.max(startMs + LAST_LINE_MS, durationMs ?? 0),
          };
        }),
      },
    ],
  };
};

const strictFind = async (
  track: Track,
): Promise<LyricsCandidate | undefined> => {
  const queries = buildQueries(track).slice(0, MAX_STRICT_QUERIES);
  const hints = collectArtistHints(track, queries);
  const durationSec = durationOf(track);
  const errors: unknown[] = [];
  let succeeded = 0;

  for (const source of SOURCES) {
    try {
      for (const [index, query] of queries.entries()) {
        const candidates = await source.search({
          query: `${query.artist} ${query.title}`.trim(),
          artist: query.artist || undefined,
          title: query.title,
          durationSec: index === 0 ? durationSec : undefined,
        });
        const best = pickBest(candidates, query, hints, durationSec);
        if (best) {
          return await source.load(best);
        }
      }
      succeeded += 1;
    } catch (error) {
      errors.push(error);
      await Logger.lyrics.warn(`${source.name} failed: ${errorText(error)}`);
    }
  }

  if (succeeded === 0 && errors.length > 0) {
    throw errors[0];
  }
  return undefined;
};

const dedupe = (candidates: LyricsCandidate[]): LyricsCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.source}|${normalize(candidate.artist)}|${normalize(candidate.title)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const findSuggestions = async (track: Track): Promise<LyricsCandidate[]> => {
  const queries = buildQueries(track);
  const hints = collectArtistHints(track, queries);
  const titles = Array.from(new Set(queries.map((query) => query.title))).slice(
    0,
    2,
  );
  if (titles.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    SOURCES.flatMap((source) =>
      titles.map((title) => source.search({ query: title, title })),
    ),
  );
  const candidates = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );

  const relevant = dedupe(
    candidates
      .filter(isLoadable)
      .filter((candidate) =>
        titles.some((title) => titleMatches(candidate.title, title)),
      ),
  );
  return rankCandidates(relevant, hints, durationOf(track)).slice(
    0,
    MAX_SUGGESTIONS,
  );
};

export const searchLyrics = async (query: string): Promise<SearchOutcome> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return { candidates: [], errors: [] };
  }
  const settled = await Promise.allSettled(
    SOURCES.map((source) => source.search({ query: trimmed })),
  );

  const candidates: LyricsCandidate[] = [];
  const errors: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      candidates.push(
        ...result.value.filter(isLoadable).slice(0, MAX_PER_SOURCE),
      );
    } else {
      errors.push(`${SOURCES[index].name}: ${errorText(result.reason)}`);
    }
  });
  return { candidates: dedupe(candidates), errors };
};

export const applyCandidate = async (
  track: Track,
  candidate: LyricsCandidate,
  manual = true,
): Promise<void> => {
  const loaded = await sourceById(candidate.source).load(candidate);
  const saved = buildSavedLyrics(loaded, track, manual);
  if (!saved) {
    throw new Error('This result has no lyrics');
  }
  await useLyricsStore.getState().save(getTrackKey(track), saved);
};

export const resetLyrics = async (track: Track): Promise<void> => {
  await useLyricsStore.getState().remove(getTrackKey(track));
};

const inFlight = new Map<string, Promise<AutoResult>>();

export const autoFindLyrics = (track: Track): Promise<AutoResult> => {
  const key = getTrackKey(track);
  if (useLyricsStore.getState().saved[key]) {
    return Promise.resolve({ found: true, suggestions: [] });
  }
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const promise = (async (): Promise<AutoResult> => {
    const strict = await strictFind(track);
    if (strict) {
      const saved = buildSavedLyrics(strict, track, false);
      if (saved) {
        await useLyricsStore.getState().save(key, saved);
        return { found: true, suggestions: [] };
      }
    }
    return { found: false, suggestions: await findSuggestions(track) };
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
};

const autoProvider: LyricsProvider = {
  id: AUTO_PROVIDER_ID,
  kind: 'lyrics',
  name: 'LRCLIB / NetEase / Genius',
  getLyrics: async (track) => {
    await autoFindLyrics(track);
    const saved = useLyricsStore.getState().saved[getTrackKey(track)];
    return saved ? savedToLyrics(saved, track.durationMs) : undefined;
  },
};

export const registerLyricsProvider = (): void => {
  providersHost.register(autoProvider);
};
