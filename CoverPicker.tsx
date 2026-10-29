import { ImageIcon } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import { readImageAsDataUrl } from '../../../services/offline/offlineEditing';

type CoverPickerProps = {
  value?: string;
  allowRemove?: boolean;
  onChange: (dataUrl: string | undefined) => void;
};

export const CoverPicker: FC<CoverPickerProps> = ({
  value,
  allowRemove = true,
  onChange,
}) => {
  const { t } = useTranslation('offline');
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasError, setHasError] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      onChange(await readImageAsDataUrl(file));
      setHasError(false);
    } catch {
      setHasError(true);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="surface-muted border-border flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border-(length:--border-width)">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={32} className="opacity-50" />
        )}
      </div>
      <div className="flex flex-col items-start gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
          data-testid="cover-file-input"
        />
        <Button
          variant="tertiary"
          size="xs"
          onClick={() => inputRef.current?.click()}
        >
          {t('cover.choose')}
        </Button>
        {allowRemove && value && (
          <Button
            variant="tertiary"
            size="xs"
            onClick={() => onChange(undefined)}
          >
            {t('cover.remove')}
          </Button>
        )}
        {hasError && (
          <span className="text-accent-red text-xs">{t('cover.error')}</span>
        )}
      </div>
    </div>
  );
};
