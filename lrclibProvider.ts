import type {
  LineSyncedLyrics,
  Lyrics,
  PlainLyrics,
  Track,
} from '@nuclearplayer/model';
import type { LyricsProvider } from '@nuclearplayer/plugin-sdk';

import { httpHost } from '../httpHost';
import { providersHost } from '../providersHost';

export const LRCLIB_PROVIDER_ID = 'lrclib';

const LRCLIB_URL = 'https://lrclib.net/api';
const CLIENT_HEADERS = {
  'User-Agent':
    'Nuclear-offline-fork (https://github.com/nicto3/nuclear_oflinne)',
};
const SPEED_VARIANT_REGEX = /sped\s*up|speed\s*up|speedup|nightcore|slowed/i;
const NOISE_REGEX =
  /\b(sped\s*up|speed\s*up|speedup|slowed(\s*(\+|and|&)?\s*reverb)?|reverb(ed)?|nightcore|bass\s*boosted?|8d\s*audio|official(\s+(audio|video|music\s*video|lyric\s*video))?|lyrics?|original\s*track|hd|hq)\b/gi;
const MAX_SEARCH_CANDIDATES = 3;
const MIN_SPEED_SCALE = 0.5;
const MAX_SPEED_SCALE = 2;
const SCALE_TOLERANCE = 0.03;
const LAST_LINE_MS = 5000;

type LrclibRecord = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

type Query = { artist: string; title: string };

type TimedLine = { startMs: number; text: string };

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const cleanTitle = (raw: string): string =>
  raw
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(NOISE_REGEX, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/[+|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildQueries = (track: Track): Query[] => {
  const artist = track.artists[0]?.name ?? '';
  const queries: Query[] = [];
  const push = (query: Query) => {
    const title = query.title.trim();
    if (!title) {
      return;
    }
    const key = `${normalize(query.artist)}|${normalize(title)}`;
    if (
      !queries.some(
        (existing) =>
          `${normalize(existing.artist)}|${normalize(existing.title)}` === key,
      )
    ) {
      queries.push({ artist: query.artist.trim(), title });
    }
  };

  const separatorIndex = track.title.indexOf(' - ');
  if (separatorIndex > 0) {
    push({
      artist: cleanTitle(track.title.slice(0, separatorIndex)),
      title: cleanTitle(track.title.slice(separatorIndex + 3)),
    });
    push({ artist, title: cleanTitle(track.title.slice(separatorIndex + 3)) });
  }
  push({ artist, title: cleanTitle(track.title) });
  return queries;
};

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

const buildSynced = (
  lines: TimedLine[],
  scale: number,
  durationMs?: number,
): LineSyncedLyrics => ({
  type: 'lineSynced',
  metadata: {},
  sections: [
    {
      lines: lines.map((line, index) => {
        const startMs = Math.round(line.startMs * scale);
        const next = lines[index + 1];
        const endMs = next
          ? Math.round(next.startMs * scale)
          : Math.max(startMs + LAST_LINE_MS, durationMs ?? 0);
        return { segments: [{ text: line.text }], startMs, endMs };
      }),
    },
  ],
});

const buildPlain = (text: string): PlainLyrics => ({
  type: 'plain',
  metadata: {},
  sections: [
    {
      lines: text
        .split(/\r?\n/)
        .map((line) => ({ segments: [{ text: line.trimEnd() }] })),
    },
  ],
});

const request = async <T>(
  path: string,
  params: Record<string, string>,
): Promise<T | undefined> => {
  const response = await httpHost.fetch(
    `${LRCLIB_URL}/${path}?${new URLSearchParams(params).toString()}`,
    { headers: CLIENT_HEADERS },
  );
  if (response.status === 404) {
    return undefined;
  }
  if (response.status >= 400) {
    throw new Error(`LRCLIB responded with ${response.status}`);
  }
  return JSON.parse(response.body) as T;
};

const hasContent = (record: LrclibRecord): boolean =>
  Boolean(record.syncedLyrics || record.plainLyrics || record.instrumental);

const titleMatches = (record: LrclibRecord, title: string): boolean => {
  const wanted = normalize(title);
  const found = normalize(record.trackName);
  if (wanted.length < 2 || found.length < 2) {
    return false;
  }
  return found.includes(wanted) || wanted.includes(found);
};

const pickBest = (
  records: LrclibRecord[],
  query: Query,
  durationSeconds: number | undefined,
): LrclibRecord | undefined => {
  const candidates = records
    .filter(hasContent)
    .filter((record) => titleMatches(record, query.title));
  if (candidates.length === 0) {
    return undefined;
  }
  const distance = (record: LrclibRecord) =>
    durationSeconds ? Math.abs(record.duration - durationSeconds) : 0;
  return [...candidates].sort((first, second) => {
    const syncedRank =
      Number(Boolean(second.syncedLyrics)) -
      Number(Boolean(first.syncedLyrics));
    return syncedRank !== 0 ? syncedRank : distance(first) - distance(second);
  })[0];
};

const findRecord = async (track: Track): Promise<LrclibRecord | undefined> => {
  const durationSeconds = track.durationMs
    ? Math.round(track.durationMs / 1000)
    : undefined;

  for (const query of buildQueries(track)) {
    if (durationSeconds && query.artist) {
      const exact = await request<LrclibRecord>('get', {
        track_name: query.title,
        artist_name: query.artist,
        duration: String(durationSeconds),
      });
      if (exact && hasContent(exact)) {
        return exact;
      }
    }

    const searches: Record<string, string>[] = [];
    if (query.artist) {
      searches.push({ track_name: query.title, artist_name: query.artist });
    }
    searches.push({ q: `${query.artist} ${query.title}`.trim() });

    for (const params of searches.slice(0, MAX_SEARCH_CANDIDATES)) {
      const results = (await request<LrclibRecord[]>('search', params)) ?? [];
      const best = pickBest(results, query, durationSeconds);
      if (best) {
        return best;
      }
    }
  }
  return undefined;
};

const toLyrics = (record: LrclibRecord, track: Track): Lyrics | undefined => {
  if (record.instrumental) {
    return { type: 'instrumental', metadata: {} };
  }

  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.length > 0) {
      const trackSeconds = track.durationMs ? track.durationMs / 1000 : 0;
      const ratio =
        trackSeconds > 0 && record.duration > 0
          ? trackSeconds / record.duration
          : 1;
      const isSpeedVariant = SPEED_VARIANT_REGEX.test(track.title);
      const shouldScale =
        isSpeedVariant &&
        Math.abs(ratio - 1) > SCALE_TOLERANCE &&
        ratio > MIN_SPEED_SCALE &&
        ratio < MAX_SPEED_SCALE;
      return buildSynced(lines, shouldScale ? ratio : 1, track.durationMs);
    }
  }

  if (record.plainLyrics) {
    return buildPlain(record.plainLyrics);
  }
  return undefined;
};

const lrclibProvider: LyricsProvider = {
  id: LRCLIB_PROVIDER_ID,
  kind: 'lyrics',
  name: 'LRCLIB',
  getLyrics: async (track) => {
    const record = await findRecord(track);
    return record ? toLyrics(record, track) : undefined;
  },
};

export const registerLrclibProvider = (): void => {
  providersHost.register(lrclibProvider);
};
