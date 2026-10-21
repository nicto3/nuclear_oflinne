import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  HeartIcon,
  Maximize2Icon,
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

import {
  MINI_PLAYER_COMMAND_EVENT,
  MINI_PLAYER_READY_EVENT,
  MINI_PLAYER_STATE_EVENT,
  type MiniPlayerCommand,
  type MiniPlayerState,
} from './miniPlayerTypes';

const ACCENT = '#22c55e';
const MUTED = 'rgba(255,255,255,0.6)';

const EMPTY_STATE: MiniPlayerState = {
  hasTrack: false,
  title: '',
  artist: '',
  isPlaying: false,
  seek: 0,
  duration: 0,
  volume: 1,
  shuffle: false,
  repeat: 'off',
  isFavorite: false,
};

const STYLES = `
  .mp-btn { transition: background 0.12s, transform 0.12s; }
  .mp-btn:hover { background: rgba(255,255,255,0.12) !important; }
  .mp-btn:active { transform: scale(0.94); }
  .mp-play:hover { background: #e5e5e5 !important; }
`;

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const sendCommand = (command: MiniPlayerCommand): void => {
  void emit(MINI_PLAYER_COMMAND_EVENT, command);
};

const iconButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  borderRadius: 999,
};

type BarProps = {
  value: number;
  label: string;
  commitWhileDragging?: boolean;
  onCommit: (fraction: number) => void;
};

const clampFraction = (value: number): number =>
  Math.max(0, Math.min(1, value));

const Bar: FC<BarProps> = ({ value, label, commitWhileDragging, onCommit }) => {
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const fractionFrom = (event: PointerEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clampFraction((event.clientX - bounds.left) / bounds.width);
  };

  const handleDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const fraction = fractionFrom(event);
    setDragFraction(fraction);
    if (commitWhileDragging) {
      onCommit(fraction);
    }
  };

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFraction === null) {
      return;
    }
    const fraction = fractionFrom(event);
    setDragFraction(fraction);
    if (commitWhileDragging) {
      onCommit(fraction);
    }
  };

  const handleUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFraction === null) {
      return;
    }
    if (!commitWhileDragging) {
      onCommit(fractionFrom(event));
    }
    setDragFraction(null);
  };

  const shown = clampFraction(dragFraction ?? value);

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      style={{
        position: 'relative',
        flex: 1,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.18)',
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
          left: `calc(${shown * 100}% - 5px)`,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: '#fff',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export const MiniPlayer: FC = () => {
  const [state, setState] = useState<MiniPlayerState>(EMPTY_STATE);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.cssText =
      'margin:0;overflow:hidden;background:transparent;user-select:none;';

    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void invoke('hide_mini_player');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    void listen<MiniPlayerState>(MINI_PLAYER_STATE_EVENT, (event) => {
      setState(event.payload);
    }).then((handler) => {
      if (disposed) {
        handler();
        return;
      }
      unlisten = handler;
      void emit(MINI_PLAYER_READY_EVENT);
    });

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const progress =
    state.duration > 0 ? Math.min(1, state.seek / state.duration) : 0;
  const RepeatMode = state.repeat === 'one' ? Repeat1Icon : RepeatIcon;

  return (
    <div
      data-testid="mini-player"
      style={{ boxSizing: 'border-box', height: '100vh', padding: 8 }}
    >
      <style>{STYLES}</style>
      <div
        style={{
          boxSizing: 'border-box',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 16,
          borderRadius: 20,
          background: 'rgba(28,28,28,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 6,
              background: '#2a2a2a',
              overflow: 'hidden',
            }}
          >
            {state.artworkUrl && (
              <img
                src={state.artworkUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {state.hasTrack ? state.title : 'Nothing playing'}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: MUTED,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {state.artist}
            </div>
          </div>
          <button
            type="button"
            className="mp-btn"
            aria-label="Open Nuclear"
            title="Open Nuclear"
            style={{ ...iconButtonStyle, color: MUTED }}
            onClick={() => void invoke('show_main_window')}
          >
            <Maximize2Icon size={16} />
          </button>
          <button
            type="button"
            className="mp-btn"
            aria-label="Close"
            title="Close"
            style={{ ...iconButtonStyle, color: MUTED }}
            onClick={() => void invoke('hide_mini_player')}
          >
            <XIcon size={16} />
          </button>
        </div>

        <div>
          <div style={{ display: 'flex' }}>
            <Bar
              label="Seek"
              value={progress}
              onCommit={(fraction) =>
                state.duration > 0 &&
                sendCommand({
                  type: 'seek',
                  seconds: fraction * state.duration,
                })
              }
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 600,
              color: MUTED,
            }}
          >
            <span>{formatTime(state.seek)}</span>
            <span>{formatTime(state.duration)}</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
          }}
        >
          <button
            type="button"
            className="mp-btn"
            aria-label="Shuffle"
            style={{
              ...iconButtonStyle,
              color: state.shuffle ? ACCENT : MUTED,
            }}
            onClick={() => sendCommand({ type: 'toggleShuffle' })}
          >
            <ShuffleIcon size={18} />
          </button>
          <button
            type="button"
            className="mp-btn"
            aria-label="Previous track"
            style={iconButtonStyle}
            onClick={() => sendCommand({ type: 'previous' })}
          >
            <SkipBackIcon size={20} fill="#fff" />
          </button>
          <button
            type="button"
            className="mp-btn mp-play"
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
            style={{
              ...iconButtonStyle,
              width: 44,
              height: 44,
              padding: 0,
              background: '#fff',
              color: '#000',
            }}
            onClick={() => sendCommand({ type: 'toggle' })}
          >
            {state.isPlaying ? (
              <PauseIcon size={20} fill="#000" />
            ) : (
              <PlayIcon size={20} fill="#000" />
            )}
          </button>
          <button
            type="button"
            className="mp-btn"
            aria-label="Next track"
            style={iconButtonStyle}
            onClick={() => sendCommand({ type: 'next' })}
          >
            <SkipForwardIcon size={20} fill="#fff" />
          </button>
          <button
            type="button"
            className="mp-btn"
            aria-label="Repeat"
            style={{
              ...iconButtonStyle,
              color: state.repeat === 'off' ? MUTED : ACCENT,
            }}
            onClick={() => sendCommand({ type: 'cycleRepeat' })}
          >
            <RepeatMode size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="mp-btn"
            aria-label={state.isFavorite ? 'Remove from favorites' : 'Favorite'}
            style={{
              ...iconButtonStyle,
              color: state.isFavorite ? '#ef4444' : MUTED,
            }}
            onClick={() => sendCommand({ type: 'toggleFavorite' })}
          >
            <HeartIcon size={18} fill={state.isFavorite ? '#ef4444' : 'none'} />
          </button>
          <button
            type="button"
            className="mp-btn"
            aria-label={state.volume > 0 ? 'Mute' : 'Unmute'}
            style={{ ...iconButtonStyle, color: MUTED }}
            onClick={() =>
              sendCommand({ type: 'volume', value: state.volume > 0 ? 0 : 1 })
            }
          >
            {state.volume > 0 ? (
              <Volume2Icon size={18} />
            ) : (
              <VolumeXIcon size={18} />
            )}
          </button>
          <Bar
            label="Volume"
            value={state.volume}
            commitWhileDragging
            onCommit={(fraction) =>
              sendCommand({ type: 'volume', value: fraction })
            }
          />
        </div>
      </div>
    </div>
  );
};
