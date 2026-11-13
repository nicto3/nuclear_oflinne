import { FC } from 'react';

import { PlayerBar } from '@nuclearplayer/ui';

import { useVolumeControl } from '../../hooks/useVolumeControl';

export const ConnectedVolume: FC = () => {
  const { percent, setVolume, toggleMute } = useVolumeControl();

  return (
    <PlayerBar.Volume
      value={percent}
      onValueChange={(value) => setVolume(value / 100)}
      onToggleMute={toggleMute}
    />
  );
};
