import { type CSSProperties, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';

import type { Palette } from '../hooks/useDominantColor';
import {
  useFullscreenBackgroundStore,
  type BackgroundMode,
} from '../stores/fullscreenBackgroundStore';

const MUTED = 'rgba(255,255,255,0.7)';

const DEFAULT_LABELS: Record<string, string> = {
  'background.title': 'Background',
  'background.palette': 'Palette',
  'background.color': 'Color',
  'background.cover': 'Cover',
  'background.accent': 'Main',
  'background.secondary': 'Second',
  'background.mood': 'Mood',
  'background.blur': 'Blur',
  'background.dim': 'Darkening',
  'background.pickColor': 'Pick a color',
};

const chipStyle = (active: boolean): CSSProperties => ({
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  borderRadius: 999,
  padding: '6px 14px',
  background: active ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
});

type FullscreenBackgroundSettingsProps = {
  palettes: Palette[] | null;
};

export const FullscreenBackgroundSettings: FC<
  FullscreenBackgroundSettingsProps
> = ({ palettes }) => {
  const { t } = useTranslation('fullscreenPlayer');
  const tr = (key: string): string =>
    t(key, { defaultValue: DEFAULT_LABELS[key] ?? key });

  const mode = useFullscreenBackgroundStore((state) => state.mode);
  const paletteIndex = useFullscreenBackgroundStore(
    (state) => state.paletteIndex,
  );
  const customColor = useFullscreenBackgroundStore(
    (state) => state.customColor,
  );
  const coverBlur = useFullscreenBackgroundStore((state) => state.coverBlur);
  const coverDim = useFullscreenBackgroundStore((state) => state.coverDim);
  const update = useFullscreenBackgroundStore((state) => state.update);

  const modes: { id: BackgroundMode; label: string }[] = [
    { id: 'palette', label: tr('background.palette') },
    { id: 'custom', label: tr('background.color') },
    { id: 'cover', label: tr('background.cover') },
  ];

  return (
    <div
      data-testid="fullscreen-background-settings"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            style={chipStyle(mode === item.id)}
            onClick={() => update({ mode: item.id })}
            data-testid={`background-mode-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'palette' && (
        <div style={{ display: 'flex', gap: 14 }}>
          {(palettes ?? []).map((palette, index) => (
            <button
              key={palette.id}
              type="button"
              onClick={() => update({ paletteIndex: index })}
              data-testid={`background-palette-${index}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: `linear-gradient(160deg, ${palette.base}, ${palette.deep})`,
                  outline:
                    paletteIndex === index
                      ? '3px solid #fff'
                      : '2px solid rgba(255,255,255,0.25)',
                }}
              />
              <span style={{ fontSize: 12, color: MUTED }}>
                {tr(`background.${palette.id}`)}
              </span>
            </button>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: MUTED,
          }}
        >
          <input
            type="color"
            value={customColor}
            aria-label={tr('background.pickColor')}
            onChange={(event) => update({ customColor: event.target.value })}
            data-testid="background-custom-color"
            style={{
              width: 54,
              height: 40,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {customColor}
          </span>
        </label>
      )}

      {mode === 'cover' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 90, color: MUTED }}>
              {tr('background.blur')}
            </span>
            <input
              type="range"
              min={0}
              max={80}
              value={coverBlur}
              onChange={(event) =>
                update({ coverBlur: Number(event.target.value) })
              }
              data-testid="background-blur"
              style={{ flex: 1, accentColor: '#fff' }}
            />
            <span style={{ width: 40, textAlign: 'right', color: MUTED }}>
              {coverBlur}
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 90, color: MUTED }}>
              {tr('background.dim')}
            </span>
            <input
              type="range"
              min={0}
              max={80}
              value={Math.round(coverDim * 100)}
              onChange={(event) =>
                update({ coverDim: Number(event.target.value) / 100 })
              }
              data-testid="background-dim"
              style={{ flex: 1, accentColor: '#fff' }}
            />
            <span style={{ width: 40, textAlign: 'right', color: MUTED }}>
              {Math.round(coverDim * 100)}%
            </span>
          </label>
        </div>
      )}
    </div>
  );
};
