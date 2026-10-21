import type { Root } from 'react-dom/client';

import { MiniPlayer } from './MiniPlayer';

export const initMiniPlayer = (root: Root): void => {
  root.render(<MiniPlayer />);
};
