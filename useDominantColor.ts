import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

export type DominantColor = {
  base: string;
  deep: string;
};

const SAMPLE_SIZE = 48;
const cache = new Map<string, DominantColor | null>();

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

const rgbToHsl = (
  red: number,
  green: number,
  blue: number,
): [number, number, number] => {
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

export const extractDominantColor = async (
  url: string,
): Promise<DominantColor | null> => {
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

  const buckets = new Map<
    number,
    { red: number; green: number; blue: number; weight: number }
  >();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 125) {
      continue;
    }
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
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

  let best: {
    red: number;
    green: number;
    blue: number;
    weight: number;
  } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) {
      best = bucket;
    }
  }
  if (!best) {
    return null;
  }

  const [hue, saturation, lightness] = rgbToHsl(
    best.red / best.weight,
    best.green / best.weight,
    best.blue / best.weight,
  );
  const baseLightness = Math.min(0.42, Math.max(0.2, lightness));
  const deepLightness = baseLightness * 0.4;
  const fmt = (value: number) => `${Math.round(value * 100)}%`;
  return {
    base: `hsl(${Math.round(hue)}, ${fmt(saturation)}, ${fmt(baseLightness)})`,
    deep: `hsl(${Math.round(hue)}, ${fmt(saturation)}, ${fmt(deepLightness)})`,
  };
};

export const useDominantColor = (url?: string): DominantColor | null => {
  const [color, setColor] = useState<DominantColor | null>(
    url ? (cache.get(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url) {
      setColor(null);
      return;
    }
    if (cache.has(url)) {
      setColor(cache.get(url) ?? null);
      return;
    }

    let cancelled = false;
    extractDominantColor(url)
      .catch(() => null)
      .then((result) => {
        cache.set(url, result);
        if (!cancelled) {
          setColor(result);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return color;
};
