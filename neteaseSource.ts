import { httpHost } from '../httpHost';
import {
  BROWSER_USER_AGENT,
  type LyricsCandidate,
  type LyricsSource,
} from './lyricsTypes';

const NETEASE_URL = 'https://music.163.com/api';
const HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  Referer: 'https://music.163.com/',
};
const SEARCH_LIMIT = 8;
const CREDIT_LINE =
  /^(作词|作曲|编曲|制作人|混音|母带|录音|监制|Lyrics\s*by|Music\s*by|Composed\s*by|Arranged\s*by|Produced\s*by)\s*[:：]/i;

type NeteaseSong = {
  id: number;
  name: string;
  duration?: number;
  dt?: number;
  artists?: { name: string }[];
  ar?: { name: string }[];
};

type NeteaseSearchResponse = {
  result?: { songs?: NeteaseSong[] };
};

type NeteaseLyricResponse = {
  lrc?: { lyric?: string };
};

const getJson = async <T>(url: string): Promise<T | undefined> => {
  const response = await httpHost.fetch(url, { headers: HEADERS });
  if (response.status >= 400) {
    throw new Error(`NetEase responded with ${response.status}`);
  }
  try {
    return JSON.parse(response.body) as T;
  } catch {
    return undefined;
  }
};

export const cleanNeteaseLrc = (lrc: string): string =>
  lrc
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.replace(/^(\[[^\]]*\])+/, '').trim();
      return !CREDIT_LINE.test(text);
    })
    .join('\n');

export const neteaseSource: LyricsSource = {
  id: 'netease',
  name: 'NetEase',

  search: async ({ query }) => {
    const params = new URLSearchParams({
      s: query,
      type: '1',
      limit: String(SEARCH_LIMIT),
      offset: '0',
    });
    const data = await getJson<NeteaseSearchResponse>(
      `${NETEASE_URL}/search/get?${params.toString()}`,
    );
    return (data?.result?.songs ?? []).map((song): LyricsCandidate => ({
      id: `netease:${song.id}`,
      source: 'netease',
      sourceName: 'NetEase',
      artist: (song.artists ?? song.ar ?? [])
        .map((artist) => artist.name)
        .join(', '),
      title: song.name,
      durationSec:
        Math.round((song.duration ?? song.dt ?? 0) / 1000) || undefined,
      ref: String(song.id),
    }));
  },

  load: async (candidate) => {
    if (candidate.synced || candidate.plain || !candidate.ref) {
      return candidate;
    }
    const data = await getJson<NeteaseLyricResponse>(
      `${NETEASE_URL}/song/lyric?id=${encodeURIComponent(candidate.ref)}&lv=-1&tv=-1`,
    );
    const lrc = data?.lrc?.lyric;
    return lrc ? { ...candidate, synced: cleanNeteaseLrc(lrc) } : candidate;
  },
};
