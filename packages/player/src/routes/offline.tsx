import { createFileRoute } from '@tanstack/react-router';

import { Offline } from '../views/Offline';

export const Route = createFileRoute('/offline')({
  component: Offline,
});
