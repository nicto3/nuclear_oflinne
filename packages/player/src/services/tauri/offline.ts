import { invoke } from '@tauri-apps/api/core';

export const offlineDownload = (
  url: string,
  fileName: string,
): Promise<number> => invoke<number>('offline_download', { url, fileName });

export const offlineDelete = async (fileName: string): Promise<void> => {
  await invoke('offline_delete', { fileName });
};
