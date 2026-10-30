import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from 'lucide-react';
import {
  useEffect,
  useState,
  type CSSProperties,
  type FC,
  type PointerEvent,
} from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { pickArtwork } from '@nuclearplayer/model';
import type { RepeatMode } from '@nuclearplayer/plugin-sdk';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { useDominantColor } from '../hooks/useDominantColor';
import { playbackManager } from '../services/playback';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useFullscreenPlayerStore } from '../stores/fullscreenPlayerStore';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';

const TITLE_BAR_HEIGHT = 26;
const MUTED = 'rgba(255,255,255,0.7)';
const FALLBACK_BASE = 'hsl(220, 10%, 24%)';
const FALLBACK_DEEP = 'hsl(220, 10%, 8%)';

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const iconButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 10,
  borderRadius: 999,
};

type SliderProps = {
  value: number;
  label: string;
  commitWhileDragging?: boolean;
  onCommit: (fraction: number) => void;
};

const Slider: FC<SliderProps> = ({
  value,
  label,
  commitWhileDragging,
  onCommit,
}) => {
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const fractionFrom = (event: PointerEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - bounds.left) / bounds.width);
  };

  const shown = clamp(dragFraction ?? value);

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const fraction = fractionFrom(event);
        setDragFraction(fraction);
        if (commitWhileDragging) {
          onCommit(fraction);
        }
      }}
      onPointerMove={(event) => {
        if (dragFraction === null) {
          return;
        }
        const fraction = fractionFrom(event);
        setDragFraction(fraction);
        if (commitWhileDragging) {
          onCommit(fraction);
        }
      }}
      onPointerUp={(event) => {
        if (dragFraction === null) {
          return;
        }
        if (!commitWhileDragging) {
          onCommit(fractionFrom(event));
        }
        setDragFraction(null);
      }}
      style={{
        position: 'relative',
        flex: 1,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 5,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${shown * 100}%`,
            height: '100%',
            background: '#fff',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: `calc(${shown * 100}% - 6px)`,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: '#fff',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

const FullscreenContent: FC = () => {
  const { t } = useTranslation('playerBar');
  const close = useFullscreenPlayerStore((state) => state.close);
  const track = useQueueStore((state) => state.getCurrentItem()?.track);
  const status = useSoundStore((state) => state.status);
  const seek = useSoundStore((state) => state.seek);
  const duration = useSoundStore((state) => state.duration);
  const [shuffle, setShuffle] = useCoreSetting<boolean>('playback.shuffle');
  const [repeat, setRepeat] = useCoreSetting<RepeatMode>('playback.repeat');
  const [volume, setVolume] = useCoreSetting<number>('playback.volume');
  const { isTrackFavorite, addTrack, removeTrack } = useFavoritesStore();

  const coverUrl = pickArtwork(track?.artwork, 'cover', 640)?.url;
  const color = useDominantColor(coverUrl);
  const isPlaying = status === 'playing';
  const isFavorite = track ? isTrackFavorite(track.source) : false;
  const currentVolume = volume ?? 1;
  const repeatMode = repeat ?? 'off';
  const RepeatModeIcon = repeatMode === 'one' ? Repeat1Icon : RepeatIcon;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  const cycleRepeat = () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    setRepeat(modes[(modes.indexOf(repeatMode) + 1) % modes.length]);
  };

  const toggleFavorite = () => {
    if (!track) {
      return;
    }
    if (isFavorite) {
      removeTrack(track.source);
    } else {
      addTrack(track);
    }
  };

  return (
    <div
      data-testid="fullscreen-player"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        top: TITLE_BAR_HEIGHT,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 32,
        boxSizing: 'border-box',
        color: '#fff',
        background: `linear-gradient(160deg, ${color?.base ?? FALLBACK_BASE} 0%, ${color?.deep ?? FALLBACK_DEEP} 100%)`,
        transition: 'background 0.6s ease',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <button
        type="button"
        aria-label="Close"
        title="Esc"
        onClick={close}
        data-testid="fullscreen-close"
        style={{
          ...iconButton,
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(0,0,0,0.25)',
        }}
      >
        <XIcon size={22} />
      </button>

      <div
        style={{
          width: 'min(48vh, 40vw)',
          aspectRatio: '1',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      <div
        style={{
          width: 'min(720px, 90%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'clamp(22px, 3.4vw, 40px)',
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {track?.title ?? t('noTrackPlaying')}
          </div>
          <div
            style={{
              fontSize: 'clamp(14px, 1.8vw, 22px)',
              color: MUTED,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {track?.artists[0]?.name ?? ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: MUTED, width: 44 }}>
            {formatTime(seek)}
          </span>
          <Slider
            label="Seek"
            value={duration > 0 ? seek / duration : 0}
            onCommit={(fraction) => {
              if (duration > 0) {
                useSoundStore.getState().seekTo(fraction * duration);
              }
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: MUTED,
              width: 44,
              textAlign: 'right',
            }}
          >
            {formatTime(duration)}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 22,
          }}
        >
          <button
            type="button"
            aria-label="Shuffle"
            onClick={() => setShuffle(!shuffle)}
            style={{ ...iconButton, color: shuffle ? '#4ade80' : MUTED }}
          >
            <ShuffleIcon size={24} />
          </button>
          <button
            type="button"
            aria-label="Previous track"
            onClick={() => useQueueStore.getState().goToPrevious()}
            style={iconButton}
          >
            <SkipBackIcon size={30} fill="#fff" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => playbackManager.toggle()}
            data-testid="fullscreen-play-pause"
            style={{
              ...iconButton,
              width: 72,
              height: 72,
              padding: 0,
              background: '#fff',
              color: '#000',
            }}
          >
            {isPlaying ? (
              <PauseIcon size={32} fill="#000" />
            ) : (
              <PlayIcon size={32} fill="#000" />
            )}
          </button>
          <button
            type="button"
            aria-label="Next track"
            onClick={() => useQueueStore.getState().goToNext()}
            style={iconButton}
          >
            <SkipForwardIcon size={30} fill="#fff" />
          </button>
          <button
            type="button"
            aria-label="Repeat"
            onClick={cycleRepeat}
            style={{
              ...iconButton,
              color: repeatMode === 'off' ? MUTED : '#4ade80',
            }}
          >
            <RepeatModeIcon size={24} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 420,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          <button
            type="button"
            aria-label="Favorite"
            onClick={toggleFavorite}
            style={{ ...iconButton, color: isFavorite ? '#f87171' : MUTED }}
          >
            <HeartIcon size={22} fill={isFavorite ? '#f87171' : 'none'} />
          </button>
          <button
            type="button"
            aria-label={currentVolume > 0 ? 'Mute' : 'Unmute'}
            onClick={() => setVolume(currentVolume > 0 ? 0 : 1)}
            style={{ ...iconButton, color: MUTED }}
          >
            {currentVolume > 0 ? (
              <Volume2Icon size={22} />
            ) : (
              <VolumeXIcon size={22} />
            )}
          </button>
          <Slider
            label="Volume"
            value={currentVolume}
            commitWhileDragging
            onCommit={setVolume}
          />
        </div>
      </div>
    </div>
  );
};

export const FullscreenPlayer: FC = () => {
  const isOpen = useFullscreenPlayerStore((state) => state.isOpen);
  return isOpen ? <FullscreenContent /> : null;
};
