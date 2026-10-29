import { HardDriveDownloadIcon } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, Dialog, EmptyState } from '@nuclearplayer/ui';

import { ConnectedTrackTable } from '../../../components/ConnectedTrackTable';
import { deleteLibraryTracks } from '../../../services/offline/offlineDownloads';
import { formatSize } from '../../../services/offline/offlineSelectors';
import {
  getTrackKey,
  useOfflineStore,
  type OfflineTrackEntry,
} from '../../../stores/offlineStore';

export const OfflineLibrary: FC = () => {
  const { t } = useTranslation('offline');
  const tracks = useOfflineStore((state) => state.tracks);
  const [pendingDelete, setPendingDelete] = useState<OfflineTrackEntry | null>(
    null,
  );

  const entries = useMemo(
    () =>
      Object.values(tracks).sort((first, second) =>
        second.downloadedAtIso.localeCompare(first.downloadedAtIso),
      ),
    [tracks],
  );
  const trackList = useMemo(
    () => entries.map((entry) => entry.track),
    [entries],
  );
  const totalSize = entries.reduce(
    (total, entry) => total + entry.sizeBytes,
    0,
  );

  const handleConfirmDelete = async () => {
    if (pendingDelete) {
      await deleteLibraryTracks([pendingDelete.key]);
    }
    setPendingDelete(null);
  };

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<HardDriveDownloadIcon size={48} />}
        title={t('library.empty')}
        description={t('library.emptyDescription')}
        className="flex-1"
      />
    );
  }

  return (
    <>
      <div className="pb-2 text-sm opacity-70" data-testid="library-summary">
        {t('library.summary', {
          count: entries.length,
          size: formatSize(totalSize),
        })}
      </div>
      <ConnectedTrackTable
        tracks={trackList}
        getItemId={(track) => getTrackKey(track)}
        features={{
          header: true,
          filterable: true,
          sortable: true,
          playAll: true,
          addAllToQueue: true,
        }}
        display={{
          displayThumbnail: true,
          displayArtist: true,
          displayDuration: trackList.some((track) => track.durationMs != null),
          displayQueueControls: true,
          displayDeleteButton: true,
        }}
        actions={{
          onRemove: (track) =>
            setPendingDelete(tracks[getTrackKey(track)] ?? null),
        }}
      />
      <Dialog.Root
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
      >
        <Dialog.Title>{t('library.deleteTitle')}</Dialog.Title>
        <Dialog.Description>
          {t('library.deleteConfirm', {
            name: pendingDelete?.track.title ?? '',
          })}
        </Dialog.Description>
        <Dialog.Actions>
          <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
          <Button intent="danger" onClick={handleConfirmDelete}>
            {t('common:actions.delete')}
          </Button>
        </Dialog.Actions>
      </Dialog.Root>
    </>
  );
};
