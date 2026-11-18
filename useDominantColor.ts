import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

export type Palette = {
  id: 'accent' | 'secondary' | 'mood';
  base: string;
  deep: string;
};

type Bucket = { red: number; green: number; blue: number; weight: number };
type Hsl = [number, number, number];

const SAMPLE_SIZE = 48;
const MIN_LIGHTNESS = 0.2;
const MAX_LIGHTNESS = 0.42;
const DEEP_FACTOR = 0.4;
const MIN_HUE_DISTANCE = 35;
const MIN_SECONDARY_WEIGHT = 0.12;
const MOOD_LIGHTNESS = 0.26;
const MOOD_SATURATION_FACTOR = 0.6;
const FALLBACK_HSL: Hsl = [220, 0.1, 0.24];
const cache = new Map<string, Palette[] | null>();

export const rgbToHsl = (red: number, green: number, blue: number): Hsl => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) {
    return [0, 0, lightness];
  }
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return [hue * 60, saturation, lightness];
};

const formatHsl = ([hue, saturation, lightness]: Hsl): string =>
  `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;

const clampLightness = (value: number): number =>
  Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, value));

const hueDistance = (first: number, second: number): number => {
  const diff = Math.abs(first - second) % 360;
  return Math.min(diff, 360 - diff);
};

const makePalette = (
  id: Palette['id'],
  [hue, saturation, lightness]: Hsl,
): Palette => ({
  id,
  base: formatHsl([hue, saturation, lightness]),
  deep: formatHsl([hue, saturation, lightness * DEEP_FACTOR]),
});

export const paletteFromHex = (hex: string): Palette => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match ? match[1] : '3b7d2f';
  const [hue, saturation, lightness] = rgbToHsl(
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  );
  return makePalette('accent', [hue, saturation, clampLightness(lightness)]);
};

const bucketColor = (bucket: Bucket): Hsl =>
  rgbToHsl(
    bucket.red / bucket.weight,
    bucket.green / bucket.weight,
    bucket.blue / bucket.weight,
  );

export const buildPalettes = (data: Uint8ClampedArray): Palette[] => {
  const buckets = new Map<number, Bucket>();
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let totalCount = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 125) {
      continue;
    }
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    totalRed += red;
    totalGreen += green;
    totalBlue += blue;
    totalCount += 1;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 510;
    if (lightness < 0.06 || lightness > 0.94) {
      continue;
    }
    const saturation = max === 0 ? 0 : (max - min) / max;
    const weight = 0.15 + saturation;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = buckets.get(key) ?? {
      red: 0,
      green: 0,
      blue: 0,
      weight: 0,
    };
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    bucket.weight += weight;
    buckets.set(key, bucket);
  }

  const sorted = Array.from(buckets.values()).sort(
    (first, second) => second.weight - first.weight,
  );

  const average: Hsl =
    totalCount > 0
      ? rgbToHsl(
          totalRed / totalCount,
          totalGreen / totalCount,
          totalBlue / totalCount,
        )
      : FALLBACK_HSL;

  const [accentHue, accentSaturation, accentLightness] = sorted[0]
    ? bucketColor(sorted[0])
    : average;
  const accentHsl: Hsl = [
    accentHue,
    accentSaturation,
    clampLightness(accentLightness),
  ];

  const secondaryBucket = sorted
    .slice(1)
    .find(
      (bucket) =>
        bucket.weight >= sorted[0].weight * MIN_SECONDARY_WEIGHT &&
        hueDistance(bucketColor(bucket)[0], accentHue) >= MIN_HUE_DISTANCE,
    );
  let secondaryHsl: Hsl = [
    (accentHue + 40) % 360,
    accentSaturation * 0.8,
    accentHsl[2],
  ];
  if (secondaryBucket) {
    const [hue, saturation, lightness] = bucketColor(secondaryBucket);
    secondaryHsl = [hue, saturation, clampLightness(lightness)];
  }

  const [moodHue, moodSaturation] = average;
  const moodHsl: Hsl = [
    moodHue,
    Math.min(0.5, moodSaturation * MOOD_SATURATION_FACTOR),
    MOOD_LIGHTNESS,
  ];

  return [
    makePalette('accent', accentHsl),
    makePalette('secondary', secondaryHsl),
    makePalette('mood', moodHsl),
  ];
};

const proxiedUrl = async (url: string): Promise<string> => {
  if (url.startsWith('data:') || url.startsWith('http://127.0.0.1')) {
    return url;
  }
  const port = await invoke<number>('stream_server_port');
  const encoded = btoa(url)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `http://127.0.0.1:${port}/stream/${encoded}`;
};

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the cover'));
    image.src = source;
  });

export const extractPalettes = async (
  url: string,
): Promise<Palette[] | null> => {
  const image = await loadImage(await proxiedUrl(url));
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return buildPalettes(data);
};

export const useCoverPalettes = (url?: string): Palette[] | null => {
  const [palettes, setPalettes] = useState<Palette[] | null>(
    url ? (cache.get(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url) {
      setPalettes(null);
      return;
    }
    if (cache.has(url)) {
      setPalettes(cache.get(url) ?? null);
      return;
    }

    let cancelled = false;
    extractPalettes(url)
      .catch(() => null)
      .then((result) => {
        cache.set(url, result);
        if (!cancelled) {
          setPalettes(result);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return palettes;
};
