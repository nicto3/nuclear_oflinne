import { MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Lyrics, QueueItem } from '@nuclearplayer/model';

import { useProviders } from '../hooks/useProviders';
import { useLyrics } from '../views/Lyrics/hooks/useLyrics';

const OFFSET_STEP_MS = 100;
const MUTED = 'rgba(255,255,255,0.7)';

type LyricLine = { text: string; startMs?: number };

type FlatLyrics = {
  synced: boolean;
  lines: LyricLine[];
};

const lineText = (segments: { text: string }[]): string =>
  segments.map((segment) => segment.text).join('');

export const flattenLyrics = (lyrics: Lyrics): FlatLyrics | null => {
  if (lyrics.type === 'instrumental') {
    return null;
  }
  if (lyrics.type === 'plain') {
    return {
      synced: false,
      lines: lyrics.sections.flatMap((section) =>
        section.lines.map((line) => ({ text: lineText(line.segments) })),
      ),
    };
  }
  return {
    synced: true,
    lines: lyrics.sections.flatMap((section) =>
      section.lines.map((line) => ({
        text: lineText(line.segments),
        startMs: line.startMs,
      })),
    ),
  };
};

export const findActiveIndex = (lines: LyricLine[], nowMs: number): number => {
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

type FullscreenLyricsProps = {
  item: QueueItem | undefined;
  seekSeconds: number;
  onSeek: (seconds: number) => void;
};

export const FullscreenLyrics: FC<FullscreenLyricsProps> = ({
  item,
  seekSeconds,
  onSeek,
}) => {
  const { t } = useTranslation('fullscreenPlayer');
  const providers = useProviders('lyrics');
  const { data, isLoading } = useLyrics(item, providers);
  const [offsetMs, setOffsetMs] = useState(0);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const result = data?.[0];
  const flat = useMemo(
    () => (result ? flattenLyrics(result.lyrics) : null),
    [result],
  );
  const isInstrumental = result?.lyrics.type === 'instrumental';

  const activeIndex = flat?.synced
    ? findActiveIndex(flat.lines, seekSeconds * 1000 + offsetMs)
    : -1;

  useEffect(() => {
    setOffsetMs(0);
  }, [item?.id]);

  useEffect(() => {
    if (activeIndex >= 0) {
      lineRefs.current[activeIndex]?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  const renderBody = () => {
    if (isLoading) {
      return <div style={{ color: MUTED }}>{t('lyrics.loading')}</div>;
    }
    if (isInstrumental) {
      return <div style={{ color: MUTED }}>{t('lyrics.instrumental')}</div>;
    }
    if (!flat || flat.lines.length === 0) {
      return <div style={{ color: MUTED }}>{t('lyrics.none')}</div>;
    }
    return flat.lines.map((line, index) => {
      const isActive = index === activeIndex;
      const isClickable = flat.synced && line.startMs !== undefined;
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
            fontSize: flat.synced
              ? 'clamp(22px, 2.6vw, 38px)'
              : 'clamp(16px, 1.7vw, 24px)',
            fontWeight: flat.synced ? 800 : 600,
            lineHeight: 1.3,
            minHeight: line.text ? undefined : '0.8em',
            opacity: flat.synced ? (isActive ? 1 : 0.42) : 0.92,
            transform: isActive ? 'scale(1.02)' : 'scale(1)',
            transformOrigin: 'left center',
            transition: 'opacity 0.3s, transform 0.3s',
            cursor: isClickable ? 'pointer' : 'default',
            padding: '4px 0',
          }}
          data-testid={isActive ? 'lyrics-active-line' : undefined}
        >
          {line.text || '♪'}
        </div>
      );
    });
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
          fontSize: 13,
          color: MUTED,
        }}
      >
        <span>
          {t('lyrics.title')}
          {result ? ` · ${result.providerName}` : ''}
        </span>
        {flat?.synced && (
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          padding: flat?.synced ? '28vh 8px' : '8px',
          textAlign: 'left',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)',
        }}
      >
        {renderBody()}
      </div>
    </div>
  );
};

const offsetButton = {
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
} as const;
