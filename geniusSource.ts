import { httpHost } from '../httpHost';
import {
  BROWSER_USER_AGENT,
  type LyricsCandidate,
  type LyricsSource,
} from './lyricsTypes';

const GENIUS_URL = 'https://genius.com';
const HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  Accept: 'application/json, text/html',
};
const SEARCH_LIMIT = 6;

type GeniusHit = {
  type?: string;
  result?: {
    id: number;
    title: string;
    url: string;
    primary_artist?: { name: string };
  };
};

type GeniusSearchResponse = {
  response?: { sections?: { type?: string; hits?: GeniusHit[] }[] };
};

export const extractGeniusLyrics = (html: string): string | undefined => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const containers = Array.from(
    document.querySelectorAll('[data-lyrics-container="true"]'),
  );
  if (containers.length === 0) {
    return undefined;
  }

  const text = containers
    .map((container) => {
      container
        .querySelectorAll('br')
        .forEach((lineBreak) => lineBreak.replaceWith('\n'));
      return container.textContent ?? '';
    })
    .join('\n');

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[[^\]]*\]$/.test(line.trim()));

  const cleaned = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || undefined;
};

export const geniusSource: LyricsSource = {
  id: 'genius',
  name: 'Genius',

  search: async ({ query }) => {
    const params = new URLSearchParams({
      per_page: String(SEARCH_LIMIT),
      q: query,
    });
    const response = await httpHost.fetch(
      `${GENIUS_URL}/api/search/multi?${params.toString()}`,
      { headers: HEADERS },
    );
    if (response.status >= 400) {
      throw new Error(`Genius responded with ${response.status}`);
    }
    const data = JSON.parse(response.body) as GeniusSearchResponse;
    const hits = (data.response?.sections ?? []).flatMap(
      (section) => section.hits ?? [],
    );
    const seen = new Set<number>();
    const candidates: LyricsCandidate[] = [];
    for (const hit of hits) {
      const result = hit.result;
      if (!result || hit.type !== 'song' || seen.has(result.id)) {
        continue;
      }
      seen.add(result.id);
      candidates.push({
        id: `genius:${result.id}`,
        source: 'genius',
        sourceName: 'Genius',
        artist: result.primary_artist?.name ?? '',
        title: result.title,
        ref: result.url,
      });
    }
    return candidates;
  },

  load: async (candidate) => {
    if (candidate.plain || !candidate.ref) {
      return candidate;
    }
    const response = await httpHost.fetch(candidate.ref, { headers: HEADERS });
    if (response.status >= 400) {
      throw new Error(`Genius responded with ${response.status}`);
    }
    const plain = extractGeniusLyrics(response.body);
    return plain ? { ...candidate, plain } : candidate;
  },
};
