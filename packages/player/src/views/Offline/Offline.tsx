import { HardDriveDownloadIcon } from 'lucide-react';
import { useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';
import { Button, Dialog, EmptyState, ViewShell } from '@nuclearplayer/ui';

import { useQueueActions } from '../../hooks/useQueueActions';
import {
  cancelDownload,
  removeOfflinePlaylist,
} from '../../services/offline/offlineDownloads';
import { playbackManager } from '../../services/playback';
import { useOfflineStore } from '../../stores/offlineStore';
import { OfflinePlaylistRow } from './components/OfflinePlaylistRow';

export const Offline: FC = () => {
  const { t } = useTranslation('offline');
  const playlists = useOfflineStore((state) => state.playlists);
  const tracks = useOfflineStore((state) => state.tracks);
  const jobs = useOfflineStore((state) => state.jobs);
  const { addToQueue, clearQueue } = useQueueActions();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const playlistIds = Array.from(
    new Set([...Object.keys(jobs), ...Object.keys(playlists)]),
  );

  const sizeOf = (playlistId: string): number => {
    const entry = playlists[playlistId];
    if (!entry) {
      return 0;
    }
    return Array.from(new Set(entry.trackKeys)).reduce(
      (total, key) => total + (tracks[key]?.sizeBytes ?? 0),
      0,
    );
  };

  const handlePlay = (playlistId: string) => {
    const entry = playlists[playlistId];
    if (!entry) {
      return;
    }
    const playlistTracks = entry.trackKeys
      .map((key) => tracks[key]?.track)
      .filter((track): track is Track => Boolean(track));
    if (playlistTracks.length === 0) {
      return;
    }
    clearQueue();
    addToQueue(playlistTracks);
    playbackManager.play();
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteId) {
      await removeOfflinePlaylist(pendingDeleteId);
    }
    setPendingDeleteId(null);
  };

  const pendingName = pendingDeleteId
    ? (playlists[pendingDeleteId]?.name ?? jobs[pendingDeleteId]?.name ?? '')
    : '';

  return (
    <ViewShell data-testid="offline-view" title={t('title')}>
      {playlistIds.length === 0 ? (
        <EmptyState
          icon={<HardDriveDownloadIcon size={48} />}
          title={t('empty')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="flex w-full flex-col gap-3 pb-6">
          {playlistIds.map((playlistId) => (
            <OfflinePlaylistRow
              key={playlistId}
              playlistId={playlistId}
              entry={playlists[playlistId]}
              job={jobs[playlistId]}
              sizeBytes={sizeOf(playlistId)}
              onPlay={() => handlePlay(playlistId)}
              onCancel={() => cancelDownload(playlistId)}
              onDelete={() => setPendingDeleteId(playlistId)}
            />
          ))}
        </div>
      )}
      <Dialog.Root
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
      >
        <Dialog.Title>{t('deleteTitle')}</Dialog.Title>
        <Dialog.Description>
          {t('deleteConfirm', { name: pendingName })}
        </Dialog.Description>
        <Dialog.Actions>
          <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
          <Button intent="danger" onClick={handleConfirmDelete}>
            {t('common:actions.delete')}
          </Button>
        </Dialog.Actions>
      </Dialog.Root>
    </ViewShell>
  );
};
