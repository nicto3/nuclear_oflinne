import { PlayIcon } from 'lucide-react';
import type { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import { formatSize } from '../../../services/offline/offlineSelectors';
import type { OfflinePlaylistEntry } from '../../../stores/offlineStore';
import { PlaylistArtwork } from '../../Playlists/components/PlaylistArtwork';

type OfflinePlaylistRowProps = {
  entry: OfflinePlaylistEntry;
  trackCount: number;
  sizeBytes: number;
  thumbnails: string[];
  onOpen: () => void;
  onPlay: () => void;
};

export const OfflinePlaylistRow: FC<OfflinePlaylistRowProps> = ({
  entry,
  trackCount,
  sizeBytes,
  thumbnails,
  onOpen,
  onPlay,
}) => {
  const { t } = useTranslation('offline');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onOpen();
        }
      }}
      className="surface-muted border-border flex w-full cursor-pointer items-center gap-4 rounded-md border-(length:--border-width) p-3"
      data-testid={`offline-playlist-${entry.playlistId}`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md select-none">
        {entry.coverDataUrl ? (
          <img
            src={entry.coverDataUrl}
            alt={entry.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <PlaylistArtwork name={entry.name} thumbnails={thumbnails} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg font-semibold">{entry.name}</span>
        <span className="truncate text-sm opacity-70">
          {t('playlists.summary', {
            count: trackCount,
            size: formatSize(sizeBytes),
          })}
        </span>
      </div>
      <Button
        variant="tertiary"
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        data-testid="offline-play-button"
      >
        <PlayIcon size={16} />
        {t('play')}
      </Button>
    </div>
  );
};
