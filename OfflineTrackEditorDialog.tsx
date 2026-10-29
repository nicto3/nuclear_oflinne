import { useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { pickArtwork } from '@nuclearplayer/model';
import { Button, Dialog, Input } from '@nuclearplayer/ui';

import {
  applyTrackEdits,
  getFileNameFromPath,
  pickAudioFile,
} from '../../../services/offline/offlineEditing';
import { useOfflineEditorStore } from '../../../stores/offlineEditorStore';
import {
  useOfflineStore,
  type OfflineTrackEntry,
} from '../../../stores/offlineStore';
import { errorMessage } from '../../../utils/errorMessage';
import { CoverPicker } from './CoverPicker';

type TrackEditorFormProps = {
  entry: OfflineTrackEntry;
  onClose: () => void;
};

const TrackEditorForm: FC<TrackEditorFormProps> = ({ entry, onClose }) => {
  const { t } = useTranslation('offline');
  const [title, setTitle] = useState(entry.track.title);
  const [artistName, setArtistName] = useState(
    entry.track.artists[0]?.name ?? '',
  );
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>();
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentCover = pickArtwork(entry.track.artwork, 'cover', 256)?.url;

  const handlePickAudio = async () => {
    const path = await pickAudioFile();
    if (path) {
      setAudioPath(path);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await applyTrackEdits(entry.key, {
        title,
        artistName,
        coverDataUrl,
        audioSourcePath: audioPath ?? undefined,
      });
      onClose();
    } catch (saveError) {
      setError(t('trackEditor.error', { message: errorMessage(saveError) }));
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog.Title>{t('trackEditor.title')}</Dialog.Title>
      <Dialog.Description>{t('trackEditor.note')}</Dialog.Description>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2 pr-1">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('trackEditor.trackTitle')}
          aria-label={t('trackEditor.trackTitle')}
          data-testid="track-editor-title"
        />
        <Input
          value={artistName}
          onChange={(event) => setArtistName(event.target.value)}
          placeholder={t('trackEditor.artist')}
          aria-label={t('trackEditor.artist')}
          data-testid="track-editor-artist"
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">
            {t('trackEditor.cover')}
          </span>
          <CoverPicker
            value={coverDataUrl ?? currentCover}
            allowRemove={false}
            onChange={setCoverDataUrl}
          />
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-semibold">
            {t('trackEditor.audio')}
          </span>
          <Button variant="tertiary" size="xs" onClick={handlePickAudio}>
            {t('trackEditor.audioReplace')}
          </Button>
          <span className="text-xs opacity-70">
            {audioPath
              ? t('trackEditor.audioPicked', {
                  name: getFileNameFromPath(audioPath),
                })
              : t('trackEditor.audioKept')}
          </span>
        </div>
        {error && <span className="text-accent-red text-sm">{error}</span>}
      </div>
      <Dialog.Actions>
        <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          data-testid="track-editor-save"
        >
          {t('trackEditor.save')}
        </Button>
      </Dialog.Actions>
    </>
  );
};

export const OfflineTrackEditorDialog: FC = () => {
  const editingKey = useOfflineEditorStore((state) => state.editingKey);
  const close = useOfflineEditorStore((state) => state.close);
  const entry = useOfflineStore((state) =>
    editingKey ? state.tracks[editingKey] : undefined,
  );

  return (
    <Dialog.Root isOpen={Boolean(entry)} onClose={close}>
      {entry && (
        <TrackEditorForm key={entry.key} entry={entry} onClose={close} />
      )}
    </Dialog.Root>
  );
};
