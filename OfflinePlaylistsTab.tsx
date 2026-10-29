import { ListMusicIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, EmptyState } from '@nuclearplayer/ui';

import { useQueueActions } from '../../../hooks/useQueueActions';
import {
  getPlaylistKeys,
  getPlaylistSize,
  getPlaylistThumbnails,
  getPlaylistTracks,
} from '../../../services/offline/offlineSelectors';
import { playbackManager } from '../../../services/playback';
import {
  useOfflineStore,
  type OfflinePlaylistEntry,
} from '../../../stores/offlineStore';
import { OfflinePlaylistEditorDialog } from './OfflinePlaylistEditorDialog';
import { OfflinePlaylistRow } from './OfflinePlaylistRow';

type OfflinePlaylistsTabProps = {
  onOpenPlaylist: (playlistId: string) => void;
};

export const OfflinePlaylistsTab: FC<OfflinePlaylistsTabProps> = ({
  onOpenPlaylist,
}) => {
  const { t } = useTranslation('offline');
  const playlists = useOfflineStore((state) => state.playlists);
  const tracks = useOfflineStore((state) => state.tracks);
  const { addToQueue, clearQueue } = useQueueActions();
  const [isCreating, setIsCreating] = useState(false);

  const entries = useMemo(
    () =>
      Object.values(playlists).sort((first: OfflinePlaylistEntry, second) =>
        (second.updatedAtIso ?? second.downloadedAtIso).localeCompare(
          first.updatedAtIso ?? first.downloadedAtIso,
        ),
      ),
    [playlists],
  );

  const handlePlay = (entry: OfflinePlaylistEntry) => {
    const playlistTracks = getPlaylistTracks(entry, tracks);
    if (playlistTracks.length === 0) {
      return;
    }
    clearQueue();
    addToQueue(playlistTracks);
    playbackManager.play();
  };

  return (
    <>
      <div className="flex w-full pb-3">
        <Button
          variant="tertiary"
          onClick={() => setIsCreating(true)}
          data-testid="new-of-playlist-button"
        >
          <PlusIcon size={16} />
          {t('playlists.new')}
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={<ListMusicIcon size={48} />}
          title={t('playlists.empty')}
          description={t('playlists.emptyDescription')}
          className="flex-1"
        />
      ) : (
        <div className="flex w-full flex-col gap-3 pb-6">
          {entries.map((entry) => (
            <OfflinePlaylistRow
              key={entry.playlistId}
              entry={entry}
              trackCount={getPlaylistKeys(entry, tracks).length}
              sizeBytes={getPlaylistSize(entry, tracks)}
              thumbnails={getPlaylistThumbnails(entry, tracks)}
              onOpen={() => onOpenPlaylist(entry.playlistId)}
              onPlay={() => handlePlay(entry)}
            />
          ))}
        </div>
      )}
      <OfflinePlaylistEditorDialog
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />
    </>
  );
};
