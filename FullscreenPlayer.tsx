import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  HeartIcon,
  MicVocalIcon,
  MinusIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
  Volume1Icon,
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
import { paletteFromHex, useCoverPalettes } from '../hooks/useDominantColor';
import { useVolumeControl } from '../hooks/useVolumeControl';
import { playbackManager } from '../services/playback';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useFullscreenBackgroundStore } from '../stores/fullscreenBackgroundStore';
import { useFullscreenPlayerStore } from '../stores/fullscreenPlayerStore';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { FullscreenBackgroundSettings } from './FullscreenBackgroundSettings';
import { FullscreenLyrics } from './FullscreenLyrics';

const WINDOW_CONTROL_STYLES = `
  .fs-win-btn { transition: background 0.12s; }
  .fs-win-btn:hover { background: rgba(255,255,255,0.18) !important; }
  .fs-win-close:hover { background: #e81123 !important; }
`;

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

const windowButton: CSSProperties = {
  width: 46,
  height: 30,
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const WindowControls: FC = () => (
  <>
    <style>{WINDOW_CONTROL_STYLES}</style>
    <div
      data-tauri-drag-region
      style={{ position: 'absolute', top: 0, left: 0, right: 140, height: 30 }}
    />
    <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex' }}>
      <button
        type="button"
        className="fs-win-btn"
        aria-label="Minimize window"
        onClick={() => void getCurrentWindow().minimize()}
        style={windowButton}
      >
        <MinusIcon size={14} />
      </button>
      <button
        type="button"
        className="fs-win-btn"
        aria-label="Maximize window"
        onClick={() => void getCurrentWindow().toggleMaximize()}
        style={windowButton}
      >
        <SquareIcon size={12} />
      </button>
      <button
        type="button"
        className="fs-win-btn fs-win-close"
        aria-label="Close window"
        onClick={() => void getCurrentWindow().close()}
        style={windowButton}
      >
        <XIcon size={15} />
      </button>
    </div>
  </>
);

const FullscreenContent: FC = () => {
  const { t } = useTranslation('playerBar');
  const close = useFullscreenPlayerStore((state) => state.close);
  const showLyrics = useFullscreenPlayerStore((state) => state.showLyrics);
  const toggleLyrics = useFullscreenPlayerStore((state) => state.toggleLyrics);
  const sourcePanelOpen = useFullscreenPlayerStore(
    (state) => state.sourcePanelOpen,
  );
  const toggleSourcePanel = useFullscreenPlayerStore(
    (state) => state.toggleSourcePanel,
  );
  const closeSourcePanel = useFullscreenPlayerStore(
    (state) => state.closeSourcePanel,
  );
  const track = useQueueStore((state) => state.getCurrentItem()?.track);
  const status = useSoundStore((state) => state.status);
  const seek = useSoundStore((state) => state.seek);
  const duration = useSoundStore((state) => state.duration);
  const [shuffle, setShuffle] = useCoreSetting<boolean>('playback.shuffle');
  const [repeat, setRepeat] = useCoreSetting<RepeatMode>('playback.repeat');
  const { volume, percent, isMuted, setVolume, toggleMute } =
    useVolumeControl();
  const { isTrackFavorite, addTrack, removeTrack } = useFavoritesStore();

  const coverUrl = pickArtwork(track?.artwork, 'cover', 640)?.url;
  const palettes = useCoverPalettes(coverUrl);
  const backgroundMode = useFullscreenBackgroundStore((state) => state.mode);
  const paletteIndex = useFullscreenBackgroundStore(
    (state) => state.paletteIndex,
  );
  const customColor = useFullscreenBackgroundStore(
    (state) => state.customColor,
  );
  const coverBlur = useFullscreenBackgroundStore((state) => state.coverBlur);
  const coverDim = useFullscreenBackgroundStore((state) => state.coverDim);
  const color =
    backgroundMode === 'custom'
      ? paletteFromHex(customColor)
      : (palettes?.[paletteIndex] ?? palettes?.[0] ?? null);
  const useCoverBackground = backgroundMode === 'cover' && Boolean(coverUrl);
  const isPlaying = status === 'playing';
  const isFavorite = track ? isTrackFavorite(track.source) : false;
  const currentVolume = volume;
  const VolumeLevelIcon = isMuted
    ? VolumeXIcon
    : currentVolume < 0.5
      ? Volume1Icon
      : Volume2Icon;
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

  const coverSize = showLyrics ? 'min(36vh, 26vw)' : 'min(48vh, 40vw)';

  const mainColumn = (
    <div
      style={{
        flex: showLyrics ? '0 0 44%' : '0 1 auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: showLyrics ? 20 : 28,
        transition: 'flex-basis 0.4s ease',
      }}
    >
      <div
        style={{
          width: coverSize,
          aspectRatio: '1',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          transition: 'width 0.4s ease',
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
          width: 'min(720px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'clamp(20px, 3vw, 38px)',
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
              fontSize: 'clamp(14px, 1.7vw, 22px)',
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
            maxWidth: 460,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          <button
            type="button"
            aria-label={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            title={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            onClick={toggleLyrics}
            data-testid="fullscreen-lyrics-toggle"
            style={{
              ...iconButton,
              color: showLyrics ? '#4ade80' : MUTED,
            }}
          >
            <MicVocalIcon size={22} />
          </button>
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
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title={isMuted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
            data-testid="fullscreen-mute"
            style={{
              ...iconButton,
              color: isMuted ? 'rgba(255,255,255,0.45)' : MUTED,
            }}
          >
            <VolumeLevelIcon size={22} />
          </button>
          <Slider
            label="Volume"
            value={currentVolume}
            commitWhileDragging
            onCommit={setVolume}
          />
          <span
            data-testid="fullscreen-volume-value"
            style={{
              width: 44,
              textAlign: 'right',
              fontSize: 13,
              color: MUTED,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isMuted ? 'off' : `${percent}%`}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-testid="fullscreen-player"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 56,
        padding: '44px 48px 32px',
        boxSizing: 'border-box',
        color: '#fff',
        background: useCoverBackground
          ? '#0b0b0b'
          : `linear-gradient(160deg, ${color?.base ?? FALLBACK_BASE} 0%, ${color?.deep ?? FALLBACK_DEEP} 100%)`,
        transition: 'background 0.6s ease',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      {useCoverBackground && (
        <div
          aria-hidden
          data-testid="fullscreen-cover-background"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '-12%',
              backgroundImage: `url("${coverUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `blur(${coverBlur}px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(0,0,0,${coverDim})`,
            }}
          />
        </div>
      )}
      <WindowControls />
      <button
        type="button"
        aria-label="Close"
        title="Esc"
        onClick={close}
        data-testid="fullscreen-close"
        style={{
          ...iconButton,
          position: 'absolute',
          top: 40,
          right: 14,
          background: 'rgba(0,0,0,0.25)',
        }}
      >
        <XIcon size={22} />
      </button>

      <button
        type="button"
        aria-label="Lyrics and background settings"
        title="Lyrics and background settings"
        onClick={toggleSourcePanel}
        data-testid="fullscreen-lyrics-source"
        style={{
          ...iconButton,
          position: 'absolute',
          top: 40,
          right: 66,
          background: sourcePanelOpen
            ? 'rgba(255,255,255,0.3)'
            : 'rgba(0,0,0,0.25)',
        }}
      >
        <PencilIcon size={20} />
      </button>

      {!showLyrics && sourcePanelOpen && (
        <div
          data-testid="fullscreen-settings-card"
          style={{
            position: 'absolute',
            top: 92,
            right: 14,
            width: 340,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <FullscreenBackgroundSettings palettes={palettes} />
        </div>
      )}

      {mainColumn}

      {showLyrics && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: 760,
            height: '100%',
          }}
        >
          <FullscreenLyrics
            track={track}
            seekSeconds={seek}
            onSeek={(seconds) => useSoundStore.getState().seekTo(seconds)}
            sourcePanelOpen={sourcePanelOpen}
            onCloseSourcePanel={closeSourcePanel}
            palettes={palettes}
          />
        </div>
      )}
    </div>
  );
};

export const FullscreenPlayer: FC = () => {
  const isOpen = useFullscreenPlayerStore((state) => state.isOpen);
  return isOpen ? <FullscreenContent /> : null;
};
