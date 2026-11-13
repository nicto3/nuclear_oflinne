import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { FC } from 'react';

import { Button, Slider } from '..';
import { cn } from '../../utils';

type PlayerBarVolumeProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  onToggleMute?: () => void;
  muteLabel?: string;
  unmuteLabel?: string;
  disabled?: boolean;
  className?: string;
};

const LOW_VOLUME_LIMIT = 50;

export const PlayerBarVolume: FC<PlayerBarVolumeProps> = ({
  value,
  defaultValue,
  onValueChange,
  onToggleMute,
  muteLabel = 'Mute',
  unmuteLabel = 'Unmute',
  disabled,
  className = '',
}) => {
  const current = value ?? defaultValue ?? 0;
  const isMuted = current <= 0;
  const Icon = isMuted
    ? VolumeX
    : current < LOW_VOLUME_LIMIT
      ? Volume1
      : Volume2;
  const label = isMuted ? unmuteLabel : muteLabel;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        size="icon"
        variant="text"
        disabled={disabled}
        onClick={onToggleMute}
        aria-label={label}
        title={label}
        data-testid="player-volume-button"
      >
        <Icon size={16} className={cn({ 'opacity-50': isMuted })} />
      </Button>
      <div className="w-24" data-testid="player-volume-slider">
        <Slider
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          showValue={false}
          showFooter={false}
        />
      </div>
      <span
        className="w-9 shrink-0 text-right text-xs tabular-nums opacity-70"
        data-testid="player-volume-value"
      >
        {isMuted ? 'off' : `${Math.round(current)}%`}
      </span>
    </div>
  );
};
