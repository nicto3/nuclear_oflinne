import type { Track } from '@nuclearplayer/model';

import { httpHost } from '../httpHost';
import {
  isLoadable,
  MIN_TITLE_LENGTH,
  normalize,
  type LyricsCandidate,
  type LyricsSource,
  type Query,
} from './lyricsTypes';

const LRCLIB_URL = 'https://lrclib.net/api';
const CLIENT_HEADERS = {
  'User-Agent':
    'Nuclear-offline-fork (https://github.com/nicto3/nuclear_oflinne)',
};
const NOISE_REGEX =
  /\b(sped\s*up|speed\s*up|speedup|slowed(\s*(\+|and|&)?\s*reverb)?|reverb(ed)?|nightcore|bass\s*boosted?|8d\s*audio|official(\s+(audio|video|music\s*video|lyric\s*video))?|lyrics?|original\s*track|hd|hq)\b/gi;
const FEAT_REGEX = /\s*[([]?\b(feat|ft|featuring)\b\.?\s.*$/i;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

type LrclibRecord = {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const cleanTitle = (raw: string): string =>
  raw
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/@\S*/g, ' ')
    .replace(NOISE_REGEX, ' ')
    .replace(/[+|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripFeat = (value: string): string =>
  value.replace(FEAT_REGEX, '').trim();

const collapseDashes = (artist: string): string =>
  artist.replace(/\s+-\s+/g, '-');

export const buildQueries = (track: Track): Query[] => {
  const uploader = track.artists[0]?.name ?? '';
  const queries: Query[] = [];
  const push = (artist: string, title: string) => {
    const value = title.trim();
    if (normalize(value).length < MIN_TITLE_LENGTH) {
      return;
    }
    const key = `${normalize(artist)}|${normalize(value)}`;
    const exists = queries.some(
      (query) => `${normalize(query.artist)}|${normalize(query.title)}` === key,
    );
    if (!exists) {
      queries.push({ artist: artist.trim(), title: value });
    }
  };

  const parts = track.title.split(' - ');
  for (let index = parts.length - 1; index >= 1; index--) {
    const artistPart = stripFeat(cleanTitle(parts.slice(0, index).join(' - ')));
    const titlePart = stripFeat(cleanTitle(parts.slice(index).join(' - ')));
    push(collapseDashes(artistPart), titlePart);
    push(uploader, titlePart);
  }
  push(uploader, stripFeat(cleanTitle(track.title)));
  return queries;
};

export const collectArtistHints = (
  track: Track,
  queries: Query[],
): string[] => {
  const hints = new Set<string>();
  const add = (value: string) => {
    const normalized = normalize(value);
    if (normalized.length >= 2) {
      hints.add(normalized);
    }
  };
  track.artists.forEach((artist) => add(artist.name));
  queries.forEach((query) => {
    add(query.artist);
    add(collapseDashes(query.artist));
  });
  return Array.from(hints);
};

export type TimedLine = { startMs: number; text: string };

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_LINE = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)\s*(.*)$/;

const fractionToMs = (fraction: string | undefined): number => {
  if (!fraction) {
    return 0;
  }
  const value = parseInt(fraction, 10);
  if (fraction.length === 1) {
    return value * 100;
  }
  if (fraction.length === 2) {
    return value * 10;
  }
  return value;
};

export const parseLrc = (text: string): TimedLine[] => {
  const lines: TimedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.trim().match(LRC_LINE);
    if (!match) {
      continue;
    }
    const lyricText = match[2].trim();
    for (const tag of match[1].matchAll(TIME_TAG)) {
      const startMs =
        (parseInt(tag[1], 10) * 60 + parseInt(tag[2], 10)) * 1000 +
        fractionToMs(tag[3]);
      lines.push({ startMs, text: lyricText });
    }
  }
  return lines.sort((first, second) => first.startMs - second.startMs);
};

const retryDelayMs = (
  headers: Record<string, string> | undefined,
  attempt: number,
): number => {
  const seconds = parseFloat(headers?.['retry-after'] ?? '');
  const base = Number.isFinite(seconds) ? seconds * 1000 : attempt * 1000;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(500, base));
};

const request = async <T>(
  path: string,
  params: Record<string, string>,
): Promise<T | undefined> => {
  const url = `${LRCLIB_URL}/${path}?${new URLSearchParams(params).toString()}`;

  for (let attempt = 1; ; attempt++) {
    const response = await httpHost.fetch(url, { headers: CLIENT_HEADERS });
    if (response.status === 404) {
      return undefined;
    }
    if (response.status < 400) {
      return JSON.parse(response.body) as T;
    }
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
      throw new Error(`LRCLIB responded with ${response.status}`);
    }
    await sleep(retryDelayMs(response.headers, attempt));
  }
};

const toCandidate = (record: LrclibRecord): LyricsCandidate => ({
  id: `lrclib:${record.id}`,
  source: 'lrclib',
  sourceName: 'LRCLIB',
  artist: record.artistName,
  title: record.trackName,
  durationSec: record.duration,
  synced: record.syncedLyrics ?? undefined,
  plain: record.plainLyrics ?? undefined,
  instrumental: record.instrumental || undefined,
});

export const lrclibSource: LyricsSource = {
  id: 'lrclib',
  name: 'LRCLIB',

  search: async ({ query, artist, title, durationSec }) => {
    const found = new Map<string, LyricsCandidate>();
    const add = (records: LrclibRecord[] | undefined) =>
      (records ?? []).forEach((record) => {
        const candidate = toCandidate(record);
        if (isLoadable(candidate)) {
          found.set(candidate.id, candidate);
        }
      });

    if (artist && title && durationSec) {
      const exact = await request<LrclibRecord>('get', {
        track_name: title,
        artist_name: artist,
        duration: String(durationSec),
      });
      if (exact) {
        add([exact]);
        if (found.size > 0) {
          return Array.from(found.values());
        }
      }
    }

    if (artist && title) {
      add(
        await request<LrclibRecord[]>('search', {
          track_name: title,
          artist_name: artist,
        }),
      );
    }
    if (found.size === 0) {
      add(await request<LrclibRecord[]>('search', { q: query }));
    }
    if (found.size === 0 && title) {
      add(await request<LrclibRecord[]>('search', { track_name: title }));
    }
    return Array.from(found.values());
  },

  load: async (candidate) => candidate,
};
