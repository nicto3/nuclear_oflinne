import { invoke } from '@tauri-apps/api/core';

export const offlineDownload = (
  url: string,
  fileName: string,
): Promise<number> => invoke<number>('offline_download', { url, fileName });

export const offlineDownloadHls = (
  url: string,
  dirName: string,
): Promise<number> => invoke<number>('offline_download_hls', { url, dirName });

export const offlineDelete = async (fileName: string): Promise<void> => {
  await invoke('offline_delete', { fileName });
};
