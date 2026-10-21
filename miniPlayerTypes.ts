export const MINI_PLAYER_STATE_EVENT = 'miniplayer:state';
export const MINI_PLAYER_COMMAND_EVENT = 'miniplayer:command';
export const MINI_PLAYER_VISIBILITY_EVENT = 'miniplayer:visibility';
export const MINI_PLAYER_READY_EVENT = 'miniplayer:ready';
export const MINI_PLAYER_WINDOW_LABEL = 'miniplayer';

export type MiniPlayerState = {
  hasTrack: boolean;
  title: string;
  artist: string;
  artworkUrl?: string;
  isPlaying: boolean;
  seek: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  isFavorite: boolean;
};

export type MiniPlayerCommand =
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; seconds: number }
  | { type: 'volume'; value: number }
  | { type: 'toggleShuffle' }
  | { type: 'cycleRepeat' }
  | { type: 'toggleFavorite' };
