import { useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';
import { Button, Dialog, Input } from '@nuclearplayer/ui';

import { downloadTracks } from '../../../services/offline/offlineDownloads';

type DownloadPlaylistDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  playlistName: string;
  tracks: Track[];
};

type Mode = 'library' | 'playlist';

export const DownloadPlaylistDialog: FC<DownloadPlaylistDialogProps> = ({
  isOpen,
  onClose,
  playlistName,
  tracks,
}) => {
  const { t } = useTranslation('offline');
  const [mode, setMode] = useState<Mode>('library');
  const [name, setName] = useState(playlistName);

  const handleStart = () => {
    const finalName = name.trim() || playlistName;
    void downloadTracks({
      name: playlistName,
      tracks,
      createPlaylist: mode === 'playlist' ? { name: finalName } : undefined,
    });
    onClose();
  };

  const options: { id: Mode; title: string; hint: string }[] = [
    {
      id: 'library',
      title: t('download.toLibrary'),
      hint: t('download.toLibraryHint'),
    },
    {
      id: 'playlist',
      title: t('download.toPlaylist'),
      hint: t('download.toPlaylistHint'),
    },
  ];

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Title>{t('download.title')}</Dialog.Title>
      <Dialog.Description>{t('download.description')}</Dialog.Description>
      <div className="flex flex-col gap-3 py-2">
        {options.map((option) => (
          <Button
            key={option.id}
            variant={mode === option.id ? 'default' : 'tertiary'}
            size="flexible"
            className="flex-col items-start gap-1 px-4 py-3 text-left whitespace-normal"
            onClick={() => setMode(option.id)}
            data-testid={`download-mode-${option.id}`}
          >
            <span className="font-semibold">{option.title}</span>
            <span className="text-sm opacity-80">{option.hint}</span>
          </Button>
        ))}
        {mode === 'playlist' && (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('download.playlistName')}
            data-testid="download-playlist-name"
          />
        )}
      </div>
      <Dialog.Actions>
        <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
        <Button onClick={handleStart} data-testid="download-start-button">
          {t('download.start')}
        </Button>
      </Dialog.Actions>
    </Dialog.Root>
  );
};
