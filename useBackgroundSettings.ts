import {
  useFullscreenBackgroundStore,
  type BackgroundSettings,
} from '../stores/fullscreenBackgroundStore';

export const useBackgroundSettings = (trackKey: string) => {
  const settings = useFullscreenBackgroundStore(
    (state) => state.byTrack[trackKey] ?? state.defaults,
  );
  const hasOverride = useFullscreenBackgroundStore(
    (state) => trackKey in state.byTrack,
  );
  const updateTrack = useFullscreenBackgroundStore((state) => state.update);
  const resetTrack = useFullscreenBackgroundStore((state) => state.reset);

  return {
    settings,
    hasOverride,
    update: (patch: Partial<BackgroundSettings>) =>
      updateTrack(trackKey, patch),
    reset: () => resetTrack(trackKey),
  };
};
