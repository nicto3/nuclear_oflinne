import { PlayIcon, Trash2Icon, XIcon } from 'lucide-react';
import type { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import type {
  DownloadJob,
  OfflinePlaylistEntry,
} from '../../../stores/offlineStore';

type OfflinePlaylistRowProps = {
  playlistId: string;
  entry?: OfflinePlaylistEntry;
  job?: DownloadJob;
  sizeBytes: number;
  onPlay: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

const formatSize = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const OfflinePlaylistRow: FC<OfflinePlaylistRowProps> = ({
  playlistId,
  entry,
  job,
  sizeBytes,
  onPlay,
  onCancel,
  onDelete,
}) => {
  const { t } = useTranslation('offline');
  const isRunning = job?.status === 'running';
  const name = entry?.name ?? job?.name ?? playlistId;
  const progress =
    job && job.total > 0
      ? Math.round(((job.completed + job.failed) / job.total) * 100)
      : 0;

  return (
    <div
      className="surface-muted border-border flex w-full flex-col gap-2 rounded-md border-(length:--border-width) p-4"
      data-testid={`offline-playlist-${playlistId}`}
    >
      <div className="flex w-full items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-semibold">{name}</span>
          <span className="truncate text-sm opacity-70">
            {isRunning && job
              ? t('downloading', {
                  completed: job.completed + job.failed,
                  total: job.total,
                })
              : entry
                ? t('tracksSummary', {
                    count: entry.trackKeys.length,
                    total: entry.totalCount,
                    size: formatSize(sizeBytes),
                  })
                : ''}
          </span>
        </div>
        {!isRunning && entry && (
          <Button
            variant="tertiary"
            onClick={onPlay}
            data-testid="offline-play-button"
          >
            <PlayIcon size={16} />
            {t('play')}
          </Button>
        )}
        {isRunning ? (
          <Button
            variant="tertiary"
            onClick={onCancel}
            data-testid="offline-cancel-button"
          >
            <XIcon size={16} />
            {t('cancel')}
          </Button>
        ) : (
          <Button
            variant="tertiary"
            size="icon"
            onClick={onDelete}
            data-testid="offline-delete-button"
          >
            <Trash2Icon size={16} />
          </Button>
        )}
      </div>
      {isRunning && job && (
        <>
          <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-foreground h-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {job.currentTitle && (
            <span className="truncate text-xs opacity-70">
              {job.currentTitle}
            </span>
          )}
        </>
      )}
      {!isRunning && job && job.failed > 0 && (
        <span className="text-accent-red text-xs">
          {t('failedCount', { count: job.failed })}
          {job.lastError ? `: ${job.lastError}` : ''}
        </span>
      )}
    </div>
  );
};
