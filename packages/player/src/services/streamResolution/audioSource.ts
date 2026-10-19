import { invoke } from '@tauri-apps/api/core';

import { AudioSource } from '@nuclearplayer/hifi';
import type { StreamCandidate } from '@nuclearplayer/model';

import { fileNameFromOfflineUrl, isOfflineUrl } from '../offline/offlineUrl';

type ResolvedStream = NonNullable<StreamCandidate['stream']>;

export class AudioSourceFactory {
  private cachedStreamServerPort: number | null = null;

  async fromCandidate(candidate: StreamCandidate): Promise<AudioSource> {
    const { stream } = candidate;
    if (!stream) {
      return { url: candidate.id, protocol: 'http' };
    }

    if (stream.protocol === 'hls') {
      return { url: stream.url, protocol: 'hls' };
    }

    const port = await this.streamServerPort();
    const sourceUrl = isOfflineUrl(stream.url)
      ? this.offlineUrl(stream.url, port)
      : this.proxiedUrl(stream.url, port);

    const durationMs = stream.durationMs ?? candidate.durationMs;
    if (this.isFmp4(stream) && durationMs) {
      return {
        url: sourceUrl,
        protocol: 'mse',
        durationSeconds: durationMs / 1000,
        codec: stream.codec,
      };
    }

    return { url: sourceUrl, protocol: stream.protocol };
  }

  private async streamServerPort(): Promise<number> {
    if (this.cachedStreamServerPort === null) {
      this.cachedStreamServerPort = await invoke<number>('stream_server_port');
    }
    return this.cachedStreamServerPort;
  }

  // Encode the URL in base64 and proxy through the local streaming server to bypass CORS
  // Check packages/player/src-tauri/src/stream_server.rs to see how this works
  private proxiedUrl(url: string, port: number): string {
    const encoded = btoa(url)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `http://127.0.0.1:${port}/stream/${encoded}`;
  }

  private offlineUrl(url: string, port: number): string {
    const fileName = fileNameFromOfflineUrl(url);
    return `http://127.0.0.1:${port}/offline/${encodeURIComponent(fileName)}`;
  }

  private isFmp4(stream: ResolvedStream): boolean {
    return (
      stream.container === 'm4a' ||
      stream.mimeType?.includes('audio/mp4') === true
    );
  }
}
