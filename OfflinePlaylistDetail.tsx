import {
  ArrowLeftIcon,
  ListMusicIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, Dialog, EmptyState, Popover } from '@nuclearplayer/ui';

import { ConnectedTrackTable } from '../../../components/ConnectedTrackTable';
import { removeOfflinePlaylist } from '../../../services/offline/offlineDownloads';
import {
  formatSize,
  getPlaylistKeys,
  getPlaylistSize,
  getPlaylistThumbnails,
} from '../../../services/offline/offlineSelectors';
import { useOfflineStore } from '../../../stores/offlineStore';
import { PlaylistActions } from '../../Playlists/components/PlaylistActions';
import { PlaylistArtwork } from '../../Playlists/components/PlaylistArtwork';
import { OfflinePlaylistEditorDialog } from './OfflinePlaylistEditorDialog';

type OfflinePlaylistDetailProps = {
  playlistId: string;
  onBack: () => void;
};

export const OfflinePlaylistDetail: FC<OfflinePlaylistDetailProps> = ({
  playlistId,
  onBack,
}) => {
  const { t } = useTranslation('offline');
  const entry = useOfflineStore((state) => state.playlists[playlistId]);
  const tracks = useOfflineStore((state) => state.tracks);
  const updatePlaylist = useOfflineStore((state) => state.updatePlaylist);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const keys = useMemo(
    () => (entry ? getPlaylistKeys(entry, tracks) : []),
    [entry, tracks],
  );
  const trackList = useMemo(
    () => keys.map((key) => tracks[key].track),
    [keys, tracks],
  );

  if (!entry) {
    return null;
  }

  const handleRemove = (_track: unknown, index: number) => {
    void updatePlaylist(playlistId, {
      trackKeys: keys.filter((_key, keyIndex) => keyIndex !== index),
    });
  };

  const handleReorder = (from: number, to: number) => {
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void updatePlaylist(playlistId, { trackKeys: next });
  };

  const handleConfirmDelete = async () => {
    await removeOfflinePlaylist(playlistId);
    setIsDeleting(false);
    onBack();
  };

  return (
    <div className="flex w-full flex-col gap-4 pb-6">
      <div className="flex">
        <Button
          variant="tertiary"
          size="xs"
          onClick={onBack}
          data-testid="offline-back-button"
        >
          <ArrowLeftIcon size={14} />
          {t('playlists.back')}
        </Button>
      </div>

      <div className="border-border surface-card shadow-shadow flex flex-col gap-6 rounded-md border-(length:--border-width) p-6 md:flex-row">
        <div className="border-border shadow-shadow h-48 w-48 shrink-0 overflow-hidden rounded-md border-(length:--border-width) select-none">
          {entry.coverDataUrl ? (
            <img
              src={entry.coverDataUrl}
              alt={entry.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlaylistArtwork
              name={entry.name}
              thumbnails={getPlaylistThumbnails(entry, tracks)}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2
              className="font-heading text-4xl font-extrabold tracking-tight"
              data-testid="offline-playlist-title"
            >
              {entry.name}
            </h2>
            {entry.description && (
              <p className="text-card-foreground/60 text-lg">
                {entry.description}
              </p>
            )}
            <span className="text-sm opacity-70">
              {t('playlists.summary', {
                count: keys.length,
                size: formatSize(getPlaylistSize(entry, tracks)),
              })}
            </span>
          </div>
          <PlaylistActions
            tracks={trackList}
            menuItems={
              <>
                <Popover.Item
                  icon={<PencilIcon size={16} />}
                  onClick={() => setIsEditing(true)}
                  data-testid="edit-of-playlist-action"
                >
                  {t('playlists.edit')}
                </Popover.Item>
                <Popover.Item
                  intent="danger"
                  icon={<Trash2Icon size={16} />}
                  onClick={() => setIsDeleting(true)}
                  data-testid="delete-of-playlist-action"
                >
                  {t('playlists.delete')}
                </Popover.Item>
              </>
            }
          />
        </div>
      </div>

      {trackList.length === 0 ? (
        <EmptyState
          icon={<ListMusicIcon size={48} />}
          title={t('playlists.emptyTracks')}
          className="flex-1"
        />
      ) : (
        <ConnectedTrackTable
          tracks={trackList}
          getItemId={(_track, index) => `${keys[index]}#${index}`}
          features={{ header: true, reorderable: true }}
          display={{
            displayThumbnail: true,
            displayArtist: true,
            displayDuration: trackList.some(
              (track) => track.durationMs != null,
            ),
            displayQueueControls: true,
            displayDeleteButton: true,
          }}
          actions={{ onRemove: handleRemove, onReorder: handleReorder }}
        />
      )}

      <OfflinePlaylistEditorDialog
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        playlistId={playlistId}
      />
      <Dialog.Root isOpen={isDeleting} onClose={() => setIsDeleting(false)}>
        <Dialog.Title>{t('playlists.deleteTitle')}</Dialog.Title>
        <Dialog.Description>
          {t('playlists.deleteConfirm', { name: entry.name })}
        </Dialog.Description>
        <Dialog.Actions>
          <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
          <Button intent="danger" onClick={handleConfirmDelete}>
            {t('common:actions.delete')}
          </Button>
        </Dialog.Actions>
      </Dialog.Root>
    </div>
  );
};
