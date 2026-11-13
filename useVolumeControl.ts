import { setVolume, toggleMute } from '../services/volume';
import { useCoreSetting } from './useCoreSetting';

export const useVolumeControl = () => {
  const [stored] = useCoreSetting<number>('playback.volume');
  const volume = stored ?? 1;

  return {
    volume,
    percent: Math.round(volume * 100),
    isMuted: volume <= 0,
    setVolume,
    toggleMute,
  };
};
