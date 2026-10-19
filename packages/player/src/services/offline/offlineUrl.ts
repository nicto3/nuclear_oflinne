export const OFFLINE_PROVIDER_ID = 'offline';

const OFFLINE_URL_PREFIX = 'offline:';

export const toOfflineUrl = (fileName: string): string =>
  `${OFFLINE_URL_PREFIX}${fileName}`;

export const isOfflineUrl = (url: string): boolean =>
  url.startsWith(OFFLINE_URL_PREFIX);

export const fileNameFromOfflineUrl = (url: string): string =>
  url.slice(OFFLINE_URL_PREFIX.length);
