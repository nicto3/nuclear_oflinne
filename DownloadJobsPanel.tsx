import { XIcon } from 'lucide-react';
import type { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import { cancelDownload } from '../../../services/offline/offlineDownloads';
import {
  useOfflineStore,
  type DownloadJob,
} from '../../../stores/offlineStore';

const JobRow: FC<{ job: DownloadJob }> = ({ job }) => {
  const { t } = useTranslation('offline');
  const dismissJob = useOfflineStore((state) => state.dismissJob);
  const isRunning = job.status === 'running';
  const processed = job.completed + job.failed;
  const progress =
    job.total > 0 ? Math.round((processed / job.total) * 100) : 0;

  return (
    <div
      className="surface-muted border-border flex w-full flex-col gap-2 rounded-md border-(length:--border-width) p-3"
      data-testid={`download-job-${job.jobId}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{job.name}</span>
          <span className="truncate text-sm opacity-70">
            {isRunning
              ? t('downloading', { completed: processed, total: job.total })
              : job.skipped > 0
                ? t('jobs.skipped', { count: job.skipped })
                : ''}
          </span>
        </div>
        {isRunning ? (
          <Button
            variant="tertiary"
            size="xs"
            onClick={() => cancelDownload(job.jobId)}
            data-testid="offline-cancel-button"
          >
            {t('cancel')}
          </Button>
        ) : (
          <Button
            variant="tertiary"
            size="icon-sm"
            aria-label={t('jobs.dismiss')}
            onClick={() => dismissJob(job.jobId)}
          >
            <XIcon size={14} />
          </Button>
        )}
      </div>
      {isRunning && (
        <>
          <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-foreground h-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {job.currentTitle && (
            <span className="truncate text-xs opacity-70">
              {job.currentTitle}
            </span>
          )}
        </>
      )}
      {job.failed > 0 && (
        <span className="text-accent-red text-xs">
          {t('failedCount', { count: job.failed })}
          {job.lastError ? `: ${job.lastError}` : ''}
        </span>
      )}
    </div>
  );
};

export const DownloadJobsPanel: FC = () => {
  const jobs = useOfflineStore((state) => state.jobs);
  const list = Object.values(jobs);

  if (list.length === 0) {
    return null;
  }

  return (
    <div
      className="flex w-full flex-col gap-2 pb-4"
      data-testid="download-jobs"
    >
      {list.map((job) => (
        <JobRow key={job.jobId} job={job} />
      ))}
    </div>
  );
};
