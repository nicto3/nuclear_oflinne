import { getSetting, setSetting } from '../stores/settingsStore';

const VOLUME_SETTING = 'core.playback.volume';
const DEFAULT_RESTORE_VOLUME = 0.7;

let rememberedVolume = DEFAULT_RESTORE_VOLUME;

export const getVolume = (): number => {
  const value = getSetting(VOLUME_SETTING);
  return typeof value === 'number' ? value : 1;
};

export const setVolume = (value: number): void => {
  void setSetting(VOLUME_SETTING, Math.max(0, Math.min(1, value)));
};

export const toggleMute = (): void => {
  const current = getVolume();
  if (current > 0) {
    rememberedVolume = current;
    setVolume(0);
    return;
  }
  setVolume(rememberedVolume);
};
