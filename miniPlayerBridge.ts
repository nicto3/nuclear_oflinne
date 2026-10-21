import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

import { pickArtwork } from '@nuclearplayer/model';

import {
  MINI_PLAYER_COMMAND_EVENT,
  MINI_PLAYER_READY_EVENT,
  MINI_PLAYER_STATE_EVENT,
  MINI_PLAYER_VISIBILITY_EVENT,
  type MiniPlayerCommand,
  type MiniPlayerState,
} from '../../miniPlayer/miniPlayerTypes';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useQueueStore } from '../../stores/queueStore';
import {
  getSetting,
  setSetting,
  useSettingsStore,
} from '../../stores/settingsStore';
import { useSoundStore } from '../../stores/soundStore';
import { Logger } from '../logger';
import { playbackManager } from '../playback';

const SEEK_PUBLISH_INTERVAL_MS = 400;

const REPEAT_MODES: MiniPlayerState['repeat'][] = ['off', 'all', 'one'];
const SHUFFLE_SETTING = 'core.playback.shuffle';
const REPEAT_SETTING = 'core.playback.repeat';
const VOLUME_SETTING = 'core.playback.volume';

const readRepeat = (): MiniPlayerState['repeat'] => {
  const value = getSetting(REPEAT_SETTING);
  return REPEAT_MODES.find((mode) => mode === value) ?? 'off';
};

const buildSnapshot = (): MiniPlayerState => {
  const track = useQueueStore.getState().getCurrentItem()?.track;
  const { status, seek, duration } = useSoundStore.getState();
  const volumeSetting = getSetting(VOLUME_SETTING);

  return {
    hasTrack: Boolean(track),
    title: track?.title ?? '',
    artist: track?.artists[0]?.name ?? '',
    artworkUrl: pickArtwork(track?.artwork, 'thumbnail', 192)?.url,
    isPlaying: status === 'playing',
    seek,
    duration,
    volume: typeof volumeSetting === 'number' ? volumeSetting : 1,
    shuffle: getSetting(SHUFFLE_SETTING) === true,
    repeat: readRepeat(),
    isFavorite: track
      ? useFavoritesStore.getState().isTrackFavorite(track.source)
      : false,
  };
};

const snapshotKey = (state: MiniPlayerState): string =>
  [
    state.title,
    state.artist,
    state.artworkUrl,
    state.isPlaying,
    state.duration,
    state.volume,
    state.shuffle,
    state.repeat,
    state.isFavorite,
  ].join('|');

const handleCommand = (command: MiniPlayerCommand): void => {
  switch (command.type) {
    case 'toggle':
      playbackManager.toggle();
      break;
    case 'next':
      useQueueStore.getState().goToNext();
      break;
    case 'previous':
      useQueueStore.getState().goToPrevious();
      break;
    case 'seek':
      useSoundStore.getState().seekTo(command.seconds);
      break;
    case 'volume':
      void setSetting(VOLUME_SETTING, Math.max(0, Math.min(1, command.value)));
      break;
    case 'toggleShuffle':
      void setSetting(SHUFFLE_SETTING, getSetting(SHUFFLE_SETTING) !== true);
      break;
    case 'cycleRepeat': {
      const next = (REPEAT_MODES.indexOf(readRepeat()) + 1) % 3;
      void setSetting(REPEAT_SETTING, REPEAT_MODES[next]);
      break;
    }
    case 'toggleFavorite': {
      const track = useQueueStore.getState().getCurrentItem()?.track;
      if (!track) {
        break;
      }
      const favorites = useFavoritesStore.getState();
      if (favorites.isTrackFavorite(track.source)) {
        void favorites.removeTrack(track.source);
      } else {
        void favorites.addTrack(track);
      }
      break;
    }
  }
};

export const initMiniPlayerBridge = async (): Promise<() => void> => {
  let unsubscribeStores: (() => void) | undefined;
  let lastKey = '';
  let lastPublishedAt = 0;

  const publish = (force: boolean) => {
    const snapshot = buildSnapshot();
    const key = snapshotKey(snapshot);
    const now = Date.now();
    if (
      !force &&
      key === lastKey &&
      now - lastPublishedAt < SEEK_PUBLISH_INTERVAL_MS
    ) {
      return;
    }
    lastKey = key;
    lastPublishedAt = now;
    void emit(MINI_PLAYER_STATE_EVENT, snapshot);
  };

  const startPublishing = () => {
    if (unsubscribeStores) {
      publish(true);
      return;
    }
    publish(true);
    const unsubscribeQueue = useQueueStore.subscribe(() => publish(false));
    const unsubscribeSound = useSoundStore.subscribe(() => publish(false));
    const unsubscribeSettings = useSettingsStore.subscribe(() =>
      publish(false),
    );
    const unsubscribeFavorites = useFavoritesStore.subscribe(() =>
      publish(false),
    );
    unsubscribeStores = () => {
      unsubscribeQueue();
      unsubscribeSound();
      unsubscribeSettings();
      unsubscribeFavorites();
    };
  };

  const stopPublishing = () => {
    unsubscribeStores?.();
    unsubscribeStores = undefined;
  };

  const unlisteners: UnlistenFn[] = [];
  try {
    unlisteners.push(
      await listen<MiniPlayerCommand>(MINI_PLAYER_COMMAND_EVENT, (event) => {
        handleCommand(event.payload);
      }),
      await listen<boolean>(MINI_PLAYER_VISIBILITY_EVENT, (event) => {
        if (event.payload) {
          startPublishing();
        } else {
          stopPublishing();
        }
      }),
      await listen(MINI_PLAYER_READY_EVENT, () => {
        publish(true);
      }),
    );
  } catch (error) {
    await Logger.playback.warn(`Mini player bridge failed to start: ${error}`);
  }

  return () => {
    stopPublishing();
    unlisteners.forEach((unlisten) => unlisten());
  };
};
