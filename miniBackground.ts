import type { Palette } from '../../hooks/useDominantColor';
import { paletteFromHex } from '../../hooks/useDominantColor';
import type { MiniBackground } from '../../miniPlayer/miniPlayerTypes';
import type { BackgroundSettings } from '../../stores/fullscreenBackgroundStore';

export const resolveMiniBackground = async (
  settings: BackgroundSettings,
  coverUrl: string | undefined,
  getPalettes: (url: string) => Promise<Palette[] | null>,
): Promise<MiniBackground | null> => {
  if (settings.mode === 'custom') {
    const palette = paletteFromHex(settings.customColor);
    return { kind: 'gradient', base: palette.base, deep: palette.deep };
  }
  if (!coverUrl) {
    return null;
  }
  if (settings.mode === 'cover') {
    return {
      kind: 'cover',
      coverUrl,
      blur: settings.coverBlur,
      dim: settings.coverDim,
    };
  }
  const palettes = await getPalettes(coverUrl);
  const palette = palettes?.[settings.paletteIndex] ?? palettes?.[0];
  return palette
    ? { kind: 'gradient', base: palette.base, deep: palette.deep }
    : null;
};
