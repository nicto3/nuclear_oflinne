import { useQueryClient } from '@tanstack/react-query';
import { MinusIcon, PlusIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';

import { useTrackLyrics } from '../hooks/useTrackLyrics';
import { buildQueries, cleanTitle } from '../services/lyrics/lrclibProvider';
import {
  applyCandidate,
  resetLyrics,
  searchLyrics,
  type SearchOutcome,
} from '../services/lyrics/lyricsService';
import type {
  LyricsCandidate,
  SavedLine,
  SavedLyrics,
} from '../services/lyrics/lyricsTypes';
import { getTrackKey } from '../stores/offlineStore';

const OFFSET_STEP_MS = 100;
const MUTED = 'rgba(255,255,255,0.7)';

export const findActiveIndex = (lines: SavedLine[], nowMs: number): number => {
  let active = -1;
  for (let index = 0; index < lines.length; index++) {
    const startMs = lines[index].startMs;
    if (startMs !== undefined && startMs <= nowMs) {
      active = index;
    } else if (startMs !== undefined) {
      break;
    }
  }
  return active;
};

const formatDuration = (seconds: number | undefined): string => {
  if (!seconds) {
    return '';
  }
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const smallButton: CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  borderRadius: 999,
  padding: '6px 14px',
};

const offsetButton: CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 999,
};

type CandidateListProps = {
  candidates: LyricsCandidate[];
  busyId: string | null;
  onPick: (candidate: LyricsCandidate) => void;
};

const CandidateList: FC<CandidateListProps> = ({
  candidates,
  busyId,
  onPick,
}) => {
  const { t } = useTranslation('fullscreenPlayer');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {candidates.map((candidate) => {
        const kind = candidate.synced
          ? t('lyrics.synced')
          : candidate.source === 'netease'
            ? t('lyrics.syncedLikely')
            : t('lyrics.plain');
        return (
          <button
            key={candidate.id}
            type="button"
            disabled={busyId !== null}
            onClick={() => onPick(candidate)}
            data-testid="lyrics-candidate"
            style={{
              textAlign: 'left',
              background:
                busyId === candidate.id
                  ? 'rgba(255,255,255,0.25)'
                  : 'rgba(0,0,0,0.25)',
              border: 'none',
              color: '#fff',
              cursor: busyId === null ? 'pointer' : 'default',
              borderRadius: 10,
              padding: '10px 14px',
            }}
          >
            <div style={{ fontWeight: 700 }}>{candidate.title}</div>
            <div style={{ fontSize: 13, color: MUTED }}>
              {[
                candidate.artist,
                candidate.sourceName,
                formatDuration(candidate.durationSec),
                kind,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </button>
        );
      })}
    </div>
  );
};

type SourcePanelProps = {
  track: Track;
  saved: SavedLyrics | undefined;
  onDone: () => void;
};

const SourcePanel: FC<SourcePanelProps> = ({ track, saved, onDone }) => {
  const { t } = useTranslation('fullscreenPlayer');
  const queryClient = useQueryClient();
  const initialQuery = useMemo(() => {
    const first = buildQueries(track)[0];
    return first
      ? `${first.artist} ${first.title}`.trim()
      : cleanTitle(track.title);
  }, [track]);
  const [query, setQuery] = useState(initialQuery);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (value: string) => {
    setIsSearching(true);
    setError(null);
    try {
      setOutcome(await searchLyrics(value));
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    void runSearch(initialQuery);
  }, []);

  const handlePick = async (candidate: LyricsCandidate) => {
    setBusyId(candidate.id);
    setError(null);
    try {
      await applyCandidate(track, candidate, true);
      onDone();
    } catch (pickError) {
      setError(
        pickError instanceof Error ? pickError.message : String(pickError),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async () => {
    await resetLyrics(track);
    queryClient.removeQueries({
      queryKey: ['auto-lyrics', getTrackKey(track)],
    });
    onDone();
  };

  return (
    <div
      data-testid="lyrics-source-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        minHeight: 0,
      }}
    >
      <div style={{ fontSize: 14, color: MUTED }}>
        {t('lyrics.source')}:{' '}
        {saved ? saved.sourceLabel : t('lyrics.sourceNone')}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('lyrics.searchPlaceholder')}
          data-testid="lyrics-search-input"
          style={{
            flex: 1,
            borderRadius: 999,
            border: 'none',
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={smallButton}
          data-testid="lyrics-search-button"
        >
          {t('lyrics.search')}
        </button>
      </form>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={smallButton} onClick={onDone}>
          {t('lyrics.back')}
        </button>
        {saved && (
          <button type="button" style={smallButton} onClick={handleReset}>
            {t('lyrics.automatic')}
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {isSearching && (
          <div style={{ color: MUTED }}>{t('lyrics.searching')}</div>
        )}
        {error && <div style={{ color: '#fecaca' }}>{error}</div>}
        {outcome && !isSearching && outcome.candidates.length === 0 && (
          <div style={{ color: MUTED }}>{t('lyrics.noResults')}</div>
        )}
        {outcome && (
          <CandidateList
            candidates={outcome.candidates}
            busyId={busyId}
            onPick={handlePick}
          />
        )}
        {outcome?.errors.map((message) => (
          <div key={message} style={{ fontSize: 12, color: MUTED }}>
            {message}
          </div>
        ))}
      </div>
    </div>
  );
};

type FullscreenLyricsProps = {
  track: Track | undefined;
  seekSeconds: number;
  onSeek: (seconds: number) => void;
  sourcePanelOpen: boolean;
  onCloseSourcePanel: () => void;
};

export const FullscreenLyrics: FC<FullscreenLyricsProps> = ({
  track,
  seekSeconds,
  onSeek,
  sourcePanelOpen,
  onCloseSourcePanel,
}) => {
  const { t } = useTranslation('fullscreenPlayer');
  const { saved, isLoading, suggestions, error, refetch } =
    useTrackLyrics(track);
  const [offsetMs, setOffsetMs] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trackKey = track ? getTrackKey(track) : '';

  const isSynced = Boolean(saved?.synced);
  const lines = saved?.lines ?? [];
  const activeIndex = isSynced
    ? findActiveIndex(lines, seekSeconds * 1000 + offsetMs)
    : -1;

  useEffect(() => {
    setOffsetMs(0);
  }, [trackKey]);

  useEffect(() => {
    if (activeIndex >= 0) {
      lineRefs.current[activeIndex]?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  const pickSuggestion = async (candidate: LyricsCandidate) => {
    if (!track) {
      return;
    }
    setBusyId(candidate.id);
    try {
      await applyCandidate(track, candidate, true);
    } finally {
      setBusyId(null);
    }
  };

  const renderLines = () =>
    lines.map((line, index) => {
      const isActive = index === activeIndex;
      const isClickable = isSynced && line.startMs !== undefined;
      return (
        <div
          key={index}
          ref={(element) => {
            lineRefs.current[index] = element;
          }}
          onClick={
            isClickable
              ? () =>
                  onSeek(Math.max(0, ((line.startMs ?? 0) - offsetMs) / 1000))
              : undefined
          }
          style={{
            fontSize: isSynced
              ? 'clamp(22px, 2.6vw, 38px)'
              : 'clamp(16px, 1.7vw, 24px)',
            fontWeight: isSynced ? 800 : 600,
            lineHeight: 1.3,
            minHeight: line.text ? undefined : '0.8em',
            opacity: isSynced ? (isActive ? 1 : 0.42) : 0.92,
            transform: isActive ? 'scale(1.02)' : 'scale(1)',
            transformOrigin: 'left center',
            transition: 'opacity 0.3s, transform 0.3s',
            cursor: isClickable ? 'pointer' : 'default',
            padding: '4px 0',
          }}
          data-testid={isActive ? 'lyrics-active-line' : undefined}
        >
          {line.text || (isSynced ? '♪' : '')}
        </div>
      );
    });

  const renderBody = () => {
    if (saved) {
      return saved.instrumental ? (
        <div style={{ color: MUTED }}>{t('lyrics.instrumental')}</div>
      ) : (
        renderLines()
      );
    }
    if (isLoading) {
      return <div style={{ color: MUTED }}>{t('lyrics.loading')}</div>;
    }
    if (error) {
      return (
        <div style={{ color: MUTED }}>
          <div>{t('lyrics.error')}</div>
          <button
            type="button"
            style={{ ...smallButton, marginTop: 12 }}
            onClick={() => void refetch()}
          >
            {t('lyrics.retry')}
          </button>
        </div>
      );
    }
    if (suggestions.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: MUTED }}>{t('lyrics.suggestions')}</div>
          <CandidateList
            candidates={suggestions}
            busyId={busyId}
            onPick={pickSuggestion}
          />
        </div>
      );
    }
    return <div style={{ color: MUTED }}>{t('lyrics.none')}</div>;
  };

  return (
    <div
      data-testid="fullscreen-lyrics"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 12,
          paddingRight: 120,
          fontSize: 13,
          color: MUTED,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
          title={saved?.sourceLabel}
        >
          {t('lyrics.title')}
          {saved ? ` · ${saved.sourceLabel}` : ''}
        </span>
        {isSynced && !sourcePanelOpen && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              aria-label={t('lyrics.later')}
              title={t('lyrics.later')}
              onClick={() => setOffsetMs((current) => current - OFFSET_STEP_MS)}
              style={offsetButton}
            >
              <MinusIcon size={14} />
            </button>
            <span style={{ minWidth: 44, textAlign: 'center' }}>
              {`${offsetMs >= 0 ? '+' : ''}${(offsetMs / 1000).toFixed(1)}s`}
            </span>
            <button
              type="button"
              aria-label={t('lyrics.earlier')}
              title={t('lyrics.earlier')}
              onClick={() => setOffsetMs((current) => current + OFFSET_STEP_MS)}
              style={offsetButton}
            >
              <PlusIcon size={14} />
            </button>
          </span>
        )}
      </div>
      {sourcePanelOpen && track ? (
        <SourcePanel track={track} saved={saved} onDone={onCloseSourcePanel} />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            padding: isSynced ? '28vh 8px' : '8px',
            textAlign: 'left',
            WebkitMaskImage: isSynced
              ? 'linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)'
              : undefined,
            maskImage: isSynced
              ? 'linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)'
              : undefined,
          }}
        >
          {renderBody()}
        </div>
      )}
    </div>
  );
};
