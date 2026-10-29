import { useState, type FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, ViewShell } from '@nuclearplayer/ui';

import { useOfflineStore } from '../../stores/offlineStore';
import { DownloadJobsPanel } from './components/DownloadJobsPanel';
import { OfflineLibrary } from './components/OfflineLibrary';
import { OfflinePlaylistDetail } from './components/OfflinePlaylistDetail';
import { OfflinePlaylistsTab } from './components/OfflinePlaylistsTab';

type Tab = 'library' | 'playlists';

export const Offline: FC = () => {
  const { t } = useTranslation('offline');
  const [tab, setTab] = useState<Tab>('library');
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const playlistExists = useOfflineStore((state) =>
    openPlaylistId ? openPlaylistId in state.playlists : false,
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: t('tabs.library') },
    { id: 'playlists', label: t('tabs.playlists') },
  ];

  return (
    <ViewShell data-testid="offline-view" title={t('title')}>
      <DownloadJobsPanel />
      {openPlaylistId && playlistExists ? (
        <OfflinePlaylistDetail
          playlistId={openPlaylistId}
          onBack={() => setOpenPlaylistId(null)}
        />
      ) : (
        <>
          <div className="flex w-full gap-2 pb-4">
            {tabs.map((item) => (
              <Button
                key={item.id}
                variant={tab === item.id ? 'default' : 'tertiary'}
                onClick={() => setTab(item.id)}
                data-testid={`offline-tab-${item.id}`}
              >
                {item.label}
              </Button>
            ))}
          </div>
          {tab === 'library' ? (
            <OfflineLibrary />
          ) : (
            <OfflinePlaylistsTab onOpenPlaylist={setOpenPlaylistId} />
          )}
        </>
      )}
    </ViewShell>
  );
};
