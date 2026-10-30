import { GripVerticalIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { pickArtwork } from '@nuclearplayer/model';
import { Button, Dialog, Input } from '@nuclearplayer/ui';

import {
  useOfflineStore,
  type OfflinePlaylistEntry,
  type OfflineTrackEntry,
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

type PositionInputProps = {
  position: number;
  max: number;
  label: string;
  onCommit: (position: number) => void;
};

const PositionInput: FC<PositionInputProps> = ({
  position,
  max,
  label,
  onCommit,
}) => {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) {
      return;
    }
    const parsed = parseInt(draft, 10);
    if (!Number.isNaN(parsed)) {
      onCommit(Math.min(max, Math.max(1, parsed)));
    }
    setDraft(null);
  };

  return (
    <input
      inputMode="numeric"
      aria-label={label}
      title={label}
      value={draft ?? String(position)}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className="border-border w-12 shrink-0 rounded border-(length:--border-width) bg-transparent py-1 text-center text-sm"
      data-testid="of-position-input"
    />
  );
};

const EditorForm: FC<EditorFormProps> = ({ playlist, onClose }) => {
  const { t } = useTranslation('offline');
  const tracks = useOfflineStore((state) => state.tracks);
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [cover, setCover] = useState(playlist?.coverDataUrl);
  const [orderedKeys, setOrderedKeys] = useState<string[]>(
    Array.from(new Set(playlist?.trackKeys ?? [])).filter(
      (key) => key in tracks,
    ),
  );
  const [filter, setFilter] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const orderRef = useRef(orderedKeys);
  orderRef.current = orderedKeys;

  const libraryEntries = useMemo(
    () =>
      Object.values(tracks).sort((first, second) =>
        second.downloadedAtIso.localeCompare(first.downloadedAtIso),
      ),
    [tracks],
  );

  const availableEntries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return libraryEntries
      .filter((entry) => !orderedKeys.includes(entry.key))
      .filter(
        (entry) =>
          !query ||
          `${entry.track.title} ${entry.track.artists.map((artist) => artist.name).join(' ')}`
            .toLowerCase()
            .includes(query),
      );
  }, [libraryEntries, orderedKeys, filter]);

  const moveKey = (from: number, to: number) =>
    setOrderedKeys((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  useEffect(() => {
    if (!dragKey) {
      return;
    }

    const handleMove = (event: globalThis.PointerEvent) => {
      const container = scrollRef.current;
      if (container) {
        const bounds = container.getBoundingClientRect();
        if (event.clientY < bounds.top + 40) {
          container.scrollTop -= 14;
        } else if (event.clientY > bounds.bottom - 40) {
          container.scrollTop += 14;
        }
      }

      const keys = orderRef.current;
      const from = keys.indexOf(dragKey);
      if (from === -1) {
        return;
      }
      let insertAt = 0;
      for (const key of keys) {
        if (key === dragKey) {
          continue;
        }
        const row = rowRefs.current.get(key);
        if (!row) {
          continue;
        }
        const bounds = row.getBoundingClientRect();
        if (event.clientY > bounds.top + bounds.height / 2) {
          insertAt += 1;
        }
      }
      if (insertAt !== from) {
        moveKey(from, insertAt);
      }
    };

    const handleUp = () => setDragKey(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragKey]);

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
        trackKeys: orderedKeys,
        totalCount: orderedKeys.length,
      });
    } else {
      await store.setPlaylist({
        playlistId: `of-${Date.now().toString(36)}`,
        name: finalName,
        description: description.trim() || undefined,
        coverDataUrl: cover,
        trackKeys: orderedKeys,
        totalCount: orderedKeys.length,
        downloadedAtIso: now,
        updatedAtIso: now,
      });
    }
    onClose();
  };

  const renderTrackInfo = (entry: OfflineTrackEntry) => {
    const thumbnail = pickArtwork(entry.track.artwork, 'thumbnail', 64)?.url;
    return (
      <>
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
            {entry.track.artists.map((artist) => artist.name).join(', ')}
          </span>
        </div>
      </>
    );
  };

  return (
    <>
      <Dialog.Title>
        {playlist ? t('editor.editTitle') : t('editor.createTitle')}
      </Dialog.Title>
      <div
        ref={scrollRef}
        className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-2 pr-1"
      >
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
          <span className="font-semibold">{t('editor.inPlaylist')}</span>
          <span className="text-sm opacity-70">
            {t('editor.selected', { count: orderedKeys.length })}
          </span>
        </div>

        {orderedKeys.length === 0 ? (
          <p className="text-sm opacity-70">{t('editor.noneSelected')}</p>
        ) : (
          <div
            className="flex flex-col gap-1 select-none"
            data-testid="of-ordered-tracks"
          >
            {orderedKeys.map((key, index) => {
              const entry = tracks[key];
              if (!entry) {
                return null;
              }
              const isDragging = dragKey === key;
              return (
                <div
                  key={key}
                  ref={(element) => {
                    if (element) {
                      rowRefs.current.set(key, element);
                    } else {
                      rowRefs.current.delete(key);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-md p-2 ${isDragging ? 'bg-foreground/20' : 'hover:bg-foreground/10'}`}
                >
                  <div
                    role="button"
                    aria-label={t('editor.drag')}
                    title={t('editor.drag')}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setDragKey(key);
                    }}
                    className="flex shrink-0 cursor-grab touch-none items-center px-1 opacity-70 hover:opacity-100"
                    data-testid="of-drag-handle"
                  >
                    <GripVerticalIcon size={18} />
                  </div>
                  <PositionInput
                    position={index + 1}
                    max={orderedKeys.length}
                    label={t('editor.position')}
                    onCommit={(position) => {
                      if (position - 1 !== index) {
                        moveKey(index, position - 1);
                      }
                    }}
                  />
                  {renderTrackInfo(entry)}
                  <Button
                    variant="tertiary"
                    size="icon-sm"
                    aria-label={t('editor.removeTrack')}
                    title={t('editor.removeTrack')}
                    onClick={() =>
                      setOrderedKeys((current) =>
                        current.filter((existing) => existing !== key),
                      )
                    }
                  >
                    <XIcon size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="font-semibold">{t('editor.addFromLibrary')}</span>
          {orderedKeys.length > 0 && (
            <Button
              variant="tertiary"
              size="xs"
              onClick={() => setOrderedKeys([])}
            >
              {t('editor.clear')}
            </Button>
          )}
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
                disabled={availableEntries.length === 0}
                onClick={() =>
                  setOrderedKeys((current) => [
                    ...current,
                    ...availableEntries.map((entry) => entry.key),
                  ])
                }
              >
                {t('editor.addAll')}
              </Button>
            </div>
            {availableEntries.length === 0 && !filter ? (
              <p className="text-sm opacity-70">{t('editor.allAdded')}</p>
            ) : (
              <div
                className="flex flex-col gap-1"
                data-testid="of-track-picker"
              >
                {availableEntries.map((entry) => (
                  <label
                    key={entry.key}
                    className="hover:bg-foreground/10 flex cursor-pointer items-center gap-3 rounded-md p-2"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() =>
                        setOrderedKeys((current) => [...current, entry.key])
                      }
                      className="h-4 w-4 shrink-0"
                    />
                    {renderTrackInfo(entry)}
                  </label>
                ))}
              </div>
            )}
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
