import { useMemo, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { pickArtwork } from '@nuclearplayer/model';
import { Button, Dialog, Input } from '@nuclearplayer/ui';

import {
  useOfflineStore,
  type OfflinePlaylistEntry,
} from '../../../stores/offlineStore';
import { CoverPicker } from './CoverPicker';

type OfflinePlaylistEditorDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  playlistId?: string;
};

type EditorFormProps = {
  playlist?: OfflinePlaylistEntry;
  onClose: () => void;
};

const EditorForm: FC<EditorFormProps> = ({ playlist, onClose }) => {
  const { t } = useTranslation('offline');
  const tracks = useOfflineStore((state) => state.tracks);
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [cover, setCover] = useState(playlist?.coverDataUrl);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    Array.from(new Set(playlist?.trackKeys ?? [])).filter(
      (key) => key in tracks,
    ),
  );
  const [filter, setFilter] = useState('');

  const libraryEntries = useMemo(
    () =>
      Object.values(tracks).sort((first, second) =>
        second.downloadedAtIso.localeCompare(first.downloadedAtIso),
      ),
    [tracks],
  );

  const visibleEntries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return libraryEntries;
    }
    return libraryEntries.filter((entry) =>
      `${entry.track.title} ${entry.track.artists.map((artist) => artist.name).join(' ')}`
        .toLowerCase()
        .includes(query),
    );
  }, [libraryEntries, filter]);

  const toggleKey = (key: string) =>
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((existing) => existing !== key)
        : [...current, key],
    );

  const handleSave = async () => {
    const finalName = name.trim();
    if (!finalName) {
      return;
    }
    const now = new Date().toISOString();
    const store = useOfflineStore.getState();

    if (playlist) {
      await store.updatePlaylist(playlist.playlistId, {
        name: finalName,
        description: description.trim() || undefined,
        coverDataUrl: cover,
        trackKeys: selectedKeys,
        totalCount: selectedKeys.length,
      });
    } else {
      await store.setPlaylist({
        playlistId: `of-${Date.now().toString(36)}`,
        name: finalName,
        description: description.trim() || undefined,
        coverDataUrl: cover,
        trackKeys: selectedKeys,
        totalCount: selectedKeys.length,
        downloadedAtIso: now,
        updatedAtIso: now,
      });
    }
    onClose();
  };

  return (
    <>
      <Dialog.Title>
        {playlist ? t('editor.editTitle') : t('editor.createTitle')}
      </Dialog.Title>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2 pr-1">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('editor.namePlaceholder')}
          aria-label={t('editor.name')}
          data-testid="of-playlist-name-input"
        />
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('editor.descriptionPlaceholder')}
          aria-label={t('editor.description')}
        />
        <CoverPicker value={cover} onChange={setCover} />

        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{t('editor.tracks')}</span>
          <span className="text-sm opacity-70">
            {t('editor.selected', { count: selectedKeys.length })}
          </span>
        </div>

        {libraryEntries.length === 0 ? (
          <p className="text-sm opacity-70">{t('editor.empty')}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('editor.filter')}
                className="flex-1"
              />
              <Button
                variant="tertiary"
                size="xs"
                onClick={() =>
                  setSelectedKeys(libraryEntries.map((entry) => entry.key))
                }
              >
                {t('editor.selectAll')}
              </Button>
              <Button
                variant="tertiary"
                size="xs"
                onClick={() => setSelectedKeys([])}
              >
                {t('editor.clear')}
              </Button>
            </div>
            <div className="flex flex-col gap-1" data-testid="of-track-picker">
              {visibleEntries.map((entry) => {
                const order = selectedKeys.indexOf(entry.key);
                const thumbnail = pickArtwork(
                  entry.track.artwork,
                  'thumbnail',
                  64,
                )?.url;
                return (
                  <label
                    key={entry.key}
                    className="hover:bg-foreground/10 flex cursor-pointer items-center gap-3 rounded-md p-2"
                  >
                    <input
                      type="checkbox"
                      checked={order !== -1}
                      onChange={() => toggleKey(entry.key)}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="surface-muted h-10 w-10 shrink-0 overflow-hidden rounded">
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {entry.track.title}
                      </span>
                      <span className="truncate text-xs opacity-70">
                        {entry.track.artists
                          .map((artist) => artist.name)
                          .join(', ')}
                      </span>
                    </div>
                    {order !== -1 && (
                      <span className="text-xs opacity-70">{order + 1}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Dialog.Actions>
        <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
        <Button
          onClick={handleSave}
          disabled={name.trim().length === 0}
          data-testid="of-playlist-save-button"
        >
          {playlist ? t('editor.save') : t('editor.create')}
        </Button>
      </Dialog.Actions>
    </>
  );
};

export const OfflinePlaylistEditorDialog: FC<
  OfflinePlaylistEditorDialogProps
> = ({ isOpen, onClose, playlistId }) => {
  const playlist = useOfflineStore((state) =>
    playlistId ? state.playlists[playlistId] : undefined,
  );

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      {isOpen && (
        <EditorForm
          key={playlistId ?? 'new'}
          playlist={playlist}
          onClose={onClose}
        />
      )}
    </Dialog.Root>
  );
};
